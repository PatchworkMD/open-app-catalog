const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createRequire} = require('node:module');

const modules = process.env.HUGGINGAPP_FIREBASE_NODE_MODULES;
if (!modules) throw new Error('Set HUGGINGAPP_FIREBASE_NODE_MODULES to the isolated emulator tooling node_modules directory.');
const load = createRequire(path.join(modules,'package.json'));
const {initializeTestEnvironment,assertSucceeds,assertFails} = load('@firebase/rules-unit-testing');
const firestore = load('firebase/firestore');
const {doc,setDoc,getDoc,getDocs,deleteDoc,writeBatch,serverTimestamp,collection,updateDoc,query,where} = firestore;
const projectId = 'demo-huggingapp-auth-review';
const rules = fs.readFileSync(path.join(__dirname,'..','firestore.rules'),'utf8');

const user = (env,uid,email) => env.authenticatedContext(uid,{email,email_verified:true}).firestore();
const boardPath = (db,id) => doc(db,'boards',id);
const identityPath = (db,id) => doc(db,'boardIdentities',id);
const memberPath = (db,id,uid) => doc(db,'boards',id,'members',uid);
const indexPath = (db,uid,id) => doc(db,'users',uid,'boards',id);
const invitePath = (db,id) => doc(db,'boardInvites',id);

function ownerBatch(db,id,uid,email,{omit='',title=`Board ${id}`}={}) {
  const batch=writeBatch(db), now=serverTimestamp();
  if(omit!=='board')batch.set(boardPath(db,id),{ownerUid:uid,title,createdAt:now,updatedAt:now,schemaVersion:1,state:'active'});
  if(omit!=='identity')batch.set(identityPath(db,id),{ownerUid:uid,state:'active',createdAt:now});
  if(omit!=='member')batch.set(memberPath(db,id,uid),{uid,email,role:'owner',joinedAt:now,inviteId:null});
  if(omit!=='index')batch.set(indexPath(db,uid,id),{boardId:id,title,role:'owner'});
  return batch.commit();
}

function inviteAcceptBatch(db,id,inviteId,uid,email,{omit=''}={}) {
  const batch=writeBatch(db);
  if(omit!=='invite')batch.update(invitePath(db,inviteId),{status:'accepted',acceptedByUid:uid});
  if(omit!=='member')batch.set(memberPath(db,id,uid),{uid,email,role:'member',joinedAt:serverTimestamp(),inviteId});
  if(omit!=='index')batch.set(indexPath(db,uid,id),{boardId:id,title:`Board ${id}`,role:'member'});
  return batch.commit();
}

async function main() {
  const address = process.env.FIRESTORE_EMULATOR_HOST || '';
  if (!/^127\.0\.0\.1:\d+$/.test(address)) throw new Error('FIRESTORE_EMULATOR_HOST must target the registered loopback emulator.');
  const port = Number(address.split(':')[1]);
  if (port < 1 || port > 65535) throw new Error('The Firestore Emulator port is invalid.');
  const env=await initializeTestEnvironment({projectId,firestore:{host:'127.0.0.1',port,rules}});
  try {
    await env.clearFirestore();
    const assertAdminMissing=docPath=>env.withSecurityRulesDisabled(async ctx=>{
      const snapshot=await ctx.firestore().doc(docPath).get();
      assert.equal(snapshot.exists,false,`${docPath} should not exist after a denied atomic batch`);
    });
    const alice=user(env,'alice','alice@example.test');
    const bob=user(env,'bob','Bob@Example.Test');
    const mallory=user(env,'mallory','mallory@example.test');
    const unverified=env.authenticatedContext('unverified',{email:'unverified@example.test',email_verified:false}).firestore();
    await assertFails(ownerBatch(unverified,'unverified-board','unverified','unverified@example.test'));
    console.log('PASS verified-email requirement at owner bootstrap');

    // First-use reads only the caller-owned private index. A missing board is not readable before bootstrap.
    assert.equal((await assertSucceeds(getDoc(indexPath(alice,'alice','personal-alice')))).exists(),false);
    await assertFails(getDoc(boardPath(alice,'personal-alice')));
    await assertSucceeds(ownerBatch(alice,'personal-alice','alice','alice@example.test'));
    console.log('PASS first-use private-index bootstrap');

    // All four owner documents are one authorized unit; omitting any member invalidates the full batch.
    for(const omit of ['board','identity','member','index']) {
      const id=`incomplete-${omit}`;
      await assertFails(ownerBatch(alice,id,'alice','alice@example.test',{omit}));
      await assertAdminMissing(`boards/${id}`);
    }
    await assertSucceeds(ownerBatch(alice,'ordinary-board-id','alice','alice@example.test'));
    await assertFails(ownerBatch(mallory,'personal-bob','mallory','mallory@example.test'));
    await assertAdminMissing('boards/personal-bob');
    await assertFails(getDoc(indexPath(mallory,'alice','personal-alice')));
    console.log('PASS complete reciprocal owner writes and personal UID namespace');

    // Schema and timestamps are enforced at the write boundary.
    const bad=writeBatch(alice), stamp=serverTimestamp();
    bad.set(boardPath(alice,'bad-client-time'),{ownerUid:'alice',title:'bad',createdAt:new Date(),updatedAt:stamp,schemaVersion:1,state:'active'});
    bad.set(identityPath(alice,'bad-client-time'),{ownerUid:'alice',state:'active',createdAt:stamp});
    bad.set(memberPath(alice,'bad-client-time','alice'),{uid:'alice',email:'alice@example.test',role:'owner',joinedAt:stamp,inviteId:null});
    bad.set(indexPath(alice,'alice','bad-client-time'),{boardId:'bad-client-time',title:'bad',role:'owner'});
    await assertFails(bad.commit());
    const malformed=writeBatch(alice);
    malformed.set(boardPath(alice,'bad-schema'),{ownerUid:'alice',title:'bad',createdAt:serverTimestamp(),updatedAt:serverTimestamp(),schemaVersion:1,state:'active',unexpected:true});
    malformed.set(identityPath(alice,'bad-schema'),{ownerUid:'alice',state:'active',createdAt:serverTimestamp()});
    malformed.set(memberPath(alice,'bad-schema','alice'),{uid:'alice',email:'alice@example.test',role:'owner',joinedAt:serverTimestamp(),inviteId:null});
    malformed.set(indexPath(alice,'alice','bad-schema'),{boardId:'bad-schema',title:'bad',role:'owner'});
    await assertFails(malformed.commit());
    console.log('PASS schema and server timestamp constraints');

    const boardId='ordinary-board-id';
    await assertSucceeds(setDoc(invitePath(alice,'invite-valid-00001'),{
      boardId,boardTitle:`Board ${boardId}`,ownerUid:'alice',inviteeEmail:'bob@example.test',
      status:'pending',createdAt:serverTimestamp(),acceptedByUid:null
    }));
    const inbox=await assertSucceeds(getDocs(query(collection(bob,'boardInvites'),
      where('inviteeEmail','==','bob@example.test'),where('status','==','pending'))));
    assert.equal(inbox.docs.some(doc=>doc.id==='invite-valid-00001'),true,'invitee can list only their pending invitation');
    const ownerInvites=await assertSucceeds(getDocs(query(collection(alice,'boardInvites'),
      where('boardId','==',boardId),where('ownerUid','==','alice'))));
    assert.equal(ownerInvites.docs.some(doc=>doc.id==='invite-valid-00001'),true,'owner can list invitations for their board');
    await assertSucceeds(updateDoc(boardPath(alice,boardId),{title:'Renamed after invite',updatedAt:serverTimestamp()}));
    for(const omit of ['invite','member','index'])
      await assertFails(inviteAcceptBatch(bob,boardId,'invite-valid-00001','bob','bob@example.test',{omit}));
    assert.equal((await assertSucceeds(getDoc(invitePath(bob,'invite-valid-00001')))).data().status,'pending');
    await assertSucceeds(inviteAcceptBatch(bob,boardId,'invite-valid-00001','bob','bob@example.test'));
    await assertSucceeds(getDoc(boardPath(bob,boardId)));
    assert.equal((await assertSucceeds(getDoc(indexPath(bob,'bob',boardId)))).data().title,`Board ${boardId}`,
      'the invite title is the only title available before membership');
    await assertSucceeds(updateDoc(indexPath(bob,'bob',boardId),{title:'Renamed after invite'}));
    assert.equal((await assertSucceeds(getDoc(indexPath(bob,'bob',boardId)))).data().title,'Renamed after invite');
    await assertSucceeds(setDoc(doc(bob,'boards',boardId,'items','screen--synthetic'),{
      kind:'screen',itemId:'synthetic-screen',addedBy:'bob',addedAt:serverTimestamp()
    }));
    console.log('PASS invite pending-to-accepted atomic member/index creation');

    // Neither half of membership removal is allowed alone; removing both revokes access permanently.
    await assertFails(deleteDoc(memberPath(alice,boardId,'bob')));
    await assertFails(deleteDoc(indexPath(alice,'bob',boardId)));
    const removal=writeBatch(alice);
    removal.delete(memberPath(alice,boardId,'bob')); removal.delete(indexPath(alice,'bob',boardId));
    await assertSucceeds(removal.commit());
    await assertFails(inviteAcceptBatch(bob,boardId,'invite-valid-00001','bob','bob@example.test'));
    await assertFails(getDoc(boardPath(bob,boardId)));
    await assertFails(getDoc(doc(bob,'boards',boardId,'items','screen--synthetic')));
    console.log('PASS removed-member replay denied and paired removal revokes reads');

    // An ordinary random-ID board exercises immutable identity independently of the reserved
    // personal-* namespace. Admin deletion of the parent leaves its descendants and identity.
    const retainedBoard='r7Kp2mQ9vL4xN8cT';
    await assertSucceeds(ownerBatch(alice,retainedBoard,'alice','alice@example.test'));
    await assertSucceeds(setDoc(invitePath(alice,'invite-retained-0001'),{
      boardId:retainedBoard,boardTitle:`Board ${retainedBoard}`,ownerUid:'alice',
      inviteeEmail:'bob@example.test',status:'pending',createdAt:serverTimestamp(),acceptedByUid:null
    }));
    await assertSucceeds(inviteAcceptBatch(bob,retainedBoard,'invite-retained-0001','bob','bob@example.test'));
    await assertSucceeds(getDoc(memberPath(bob,retainedBoard,'bob')));
    await assertSucceeds(getDoc(indexPath(bob,'bob',retainedBoard)));
    await assertSucceeds(getDoc(boardPath(bob,retainedBoard)));
    await assertSucceeds(setDoc(doc(bob,'boards',retainedBoard,'items','screen--retained'),{
      kind:'screen',itemId:'retained-private-screen',addedBy:'bob',addedAt:serverTimestamp()
    }));
    await assertSucceeds(getDoc(doc(bob,'boards',retainedBoard,'items','screen--retained')));
    await assertSucceeds(updateDoc(boardPath(alice,retainedBoard),{title:'Parent removed later',updatedAt:serverTimestamp()}));
    await assertFails(deleteDoc(boardPath(alice,retainedBoard)));
    await env.withSecurityRulesDisabled(async ctx=>{
      const db=ctx.firestore();
      await deleteDoc(boardPath(db,retainedBoard));
    });
    await assertFails(ownerBatch(mallory,retainedBoard,'mallory','mallory@example.test'));
    await assertFails(ownerBatch(alice,retainedBoard,'alice','alice@example.test'));
    await assertFails(setDoc(boardPath(alice,retainedBoard),{
      ownerUid:'alice',title:`Board ${retainedBoard}`,createdAt:serverTimestamp(),updatedAt:serverTimestamp(),
      schemaVersion:1,state:'active'
    }));
    await assertFails(getDoc(memberPath(bob,retainedBoard,'bob')));
    await assertFails(getDoc(doc(bob,'boards',retainedBoard,'items','screen--retained')));
    await assertFails(setDoc(doc(bob,'boards',retainedBoard,'items','screen--stale-write'),{
      kind:'screen',itemId:'stale-write',addedBy:'bob',addedAt:serverTimestamp()
    }));
    await env.withSecurityRulesDisabled(async ctx=>{
      const db=ctx.firestore();
      assert.equal((await getDoc(boardPath(db,retainedBoard))).exists(),false);
      assert.equal((await getDoc(identityPath(db,retainedBoard))).data().ownerUid,'alice');
      assert.equal((await getDoc(memberPath(db,retainedBoard,'bob'))).exists(),true);
      assert.equal((await getDoc(indexPath(db,'bob',retainedBoard))).exists(),true);
      assert.equal((await getDoc(doc(db,'boards',retainedBoard,'items','screen--retained'))).exists(),true);
    });
    console.log('PASS ordinary-ID parent deletion preserves identity and retained children while denying reuse and stale-member access');

    // Parent deletion is never a client lifecycle operation. The personal-ID case separately
    // covers the reserved namespace; ordinary-ID protection is exercised above.
    await assertFails(deleteDoc(boardPath(alice,boardId)));
    await assertSucceeds(setDoc(doc(alice,'boards','personal-alice','items','screen--retained'),{
      kind:'screen',itemId:'retained-private-screen',addedBy:'alice',addedAt:serverTimestamp()
    }));
    await env.withSecurityRulesDisabled(async ctx=>{
      const db=ctx.firestore();
      await deleteDoc(boardPath(db,'personal-alice'));
    });
    await assertFails(ownerBatch(mallory,'personal-alice','mallory','mallory@example.test'));
    await assertFails(ownerBatch(alice,'personal-alice','alice','alice@example.test'));
    await assertFails(getDoc(memberPath(alice,'personal-alice','alice')));
    await assertFails(getDoc(doc(alice,'boards','personal-alice','items','screen--retained')));
    assert.equal((await assertSucceeds(getDoc(indexPath(alice,'alice','personal-alice')))).exists(),true,
      'the owner-only index may retain a pointer but cannot authorize access to the deleted board');
    console.log('PASS parent deletion leaves non-reusable identity and denies all board paths');

    // A revoked pending invite cannot be accepted by a stale invitee page.
    await assertSucceeds(setDoc(invitePath(alice,'invite-revoked-0001'),{
      boardId:'ordinary-board-id',boardTitle:'Board ordinary-board-id',ownerUid:'alice',
      inviteeEmail:'bob@example.test',status:'pending',createdAt:serverTimestamp(),acceptedByUid:null
    }));
    await assertSucceeds(updateDoc(invitePath(alice,'invite-revoked-0001'),{status:'revoked',acceptedByUid:null}));
    await assertFails(inviteAcceptBatch(bob,'ordinary-board-id','invite-revoked-0001','bob','bob@example.test'));
    console.log('PASS revoked invitation is not accepted');
  } finally {
    await env.cleanup();
  }
}

main().catch(error=>{console.error(error);process.exitCode=1;});
