const $ = id => document.getElementById(id);
const boardModel = window.HuggingBoardModel;
const ids = {
  accountButton:'accountButton', accountDialog:'accountDialog', accountClose:'accountClose',
  accountStatus:'accountStatus', accountSetup:'accountSetup', accountSignedOut:'accountSignedOut',
  accountSignedIn:'accountSignedIn', userSummary:'userSummary', googleSignIn:'googleSignIn', emailForm:'emailForm', email:'email',
  password:'password', authMode:'authMode', authSubmit:'authSubmit', authToggle:'authToggle',
  forgotPassword:'forgotPassword', resendVerification:'resendVerification', signOut:'signOut',
  shareForm:'shareForm', shareEmail:'shareEmail', boardMembers:'boardMembers'
};
const COLLECTIONS = { boards:'boards', members:'members', invites:'invites' };
const MAX_IDS = { screenshots:5000, collections:1000 };
let client, user = null, activeCloudBoard = null, localBoardId = null, ready = false;
const remoteBoards = new Map();
let unsubscribeBoard = null, applyingRemote = false;
const pendingCreates = new Map();

function node(name) { return $(ids[name]); }
function setStatus(message) { const el = node('accountStatus'); if (el) el.textContent = message; }
function setVisible(name, visible) { const el = node(name); if (el) el.hidden = !visible; }
function normalEmail(value) { return String(value || '').trim().toLowerCase(); }
function safeIds(values, max) {
  return [...new Set((Array.isArray(values) ? values : []).filter(x => typeof x === 'string' && x.length > 0 && x.length <= 180))].slice(0, max);
}
function mergeIdSet(current, base, desired, max) {
  const result = new Set(safeIds(current, max));
  const before = new Set(safeIds(base, max));
  const after = new Set(safeIds(desired, max));
  for (const id of after) if (!before.has(id)) result.add(id);
  for (const id of before) if (!after.has(id)) result.delete(id);
  return [...result].slice(0, max);
}
function app() { return window.huggingApp || null; }
function activeLocalBoard() {
  const api = app();
  const active = api?.getActiveBoard?.();
  if (active && typeof active === 'object') return active;
  const id = typeof active === 'string' ? active : null;
  const boards = api?.getBoards?.();
  if (Array.isArray(boards)) return boards.find(board => board?.id === id) || boards[0] || null;
  return null;
}
function localId(board) { return board?.localId || board?.id || 'default'; }
function boardPayload(board = activeLocalBoard()) {
  const screenshots = board?.appIds || board?.screenshotIds || board?.screenshots || board?.savedScreenshotIds || [];
  const collections = board?.collectionIds || board?.savedCollections || [];
  return {
    screenshotIds: safeIds(screenshots, MAX_IDS.screenshots),
    collectionIds: safeIds(collections, MAX_IDS.collections)
  };
}
function normalizeRemote(snapshot) {
  const value = snapshot.data();
  return { id:snapshot.id, cloudId:snapshot.id, localId:value.localId || null, name:value.title || 'Saved board', ownerUid:value.ownerUid,
    appIds:safeIds(value.screenshotIds, MAX_IDS.screenshots),
    collectionIds:safeIds(value.collectionIds, MAX_IDS.collections),
    createdAt:value.createdAt || null, updatedAt:value.updatedAt || null };
}
function assertVerified() {
  if (!user?.emailVerified) throw new Error('Verify your email before you use shared boards.');
}
function setSignedInUI() {
  setVisible('accountSignedOut', !user);
  setVisible('accountSignedIn', Boolean(user));
  setVisible('resendVerification', Boolean(user?.email && !user.emailVerified));
  if (node('userSummary')) node('userSummary').textContent = user?.email || '';
  setVisible('shareForm', false);
  node('boardMembers')?.replaceChildren();
}
function showSetup(reason) {
  app()?.setCloudBoards?.([], null);
  setVisible('accountSetup', true);
  setVisible('accountSignedOut', false);
  setVisible('accountSignedIn', false);
  if (reason === 'incomplete') {
    setStatus('Cloud sync is disabled. An owner must complete Firebase setup before accounts can connect.');
  } else if (reason === 'disabled') {
    setStatus('Cloud sync is off. Your saved board stays on this device.');
  } else if (reason === 'wrong-project') {
    setStatus('Cloud sync must use the dedicated Hugging App Firebase project.');
  } else {
    setStatus('Firebase is not available. Your saved board stays on this device.');
  }
}
function setCloudBoard(localIdValue, record) {
  localBoardId = localIdValue;
  activeCloudBoard = record;
  return app()?.setCloudBoard?.(localIdValue, record) || record;
}

async function applyRemoteBoard(record) {
  if (!record) return;
  activeCloudBoard = record;
  applyingRemote = true;
  let applied;
  try { applied = app()?.applyCloudBoard?.(record); }
  finally { applyingRemote = false; }
  if (applied && boardModel.hasPendingSync(applied)) {
    try {
      await syncBoard(applied);
      setStatus('Saved board changes are synced.');
    } catch {
      setStatus('Your board changes are saved on this device. Cloud sync will retry when available.');
    }
  }
}

function watchBoard(record) {
  unsubscribeBoard?.();
  unsubscribeBoard = null;
  if (!record?.id || !client) return;
  const { doc, onSnapshot } = client.dbSdk;
  unsubscribeBoard = onSnapshot(doc(client.db, COLLECTIONS.boards, record.id), snapshot => {
    if (!snapshot.exists()) return;
    const latest = normalizeRemote(snapshot);
    remoteBoards.set(latest.id, latest);
    if (activeCloudBoard?.id === latest.id) void applyRemoteBoard(latest);
  }, error => setStatus(error?.message || 'Live board updates are unavailable.'));
}

async function ensureDefaultCloudBoard({ allowEmpty = false } = {}) {
  if (!user || !client) return;
  const board = activeLocalBoard();
  if (!board) return;
  const boardId = localId(board);
  const selectedCloudId = board.cloudId || board.id;
  const selectedRemote = remoteBoards.get(selectedCloudId);
  if (selectedRemote) {
    activeCloudBoard = selectedRemote;
    return;
  }
  const linked = [...remoteBoards.values()].find(record => record.ownerUid === user.uid && (record.id === boardId || record.localId === boardId));
  if (linked) {
    activeCloudBoard = linked;
    setCloudBoard(boardId, linked);
    watchBoard(linked);
    return;
  }
  const { collection, query, where, getDocs, getDoc, doc, setDoc, serverTimestamp } = client.dbSdk;
  const existing = await getDocs(query(collection(client.db, COLLECTIONS.boards), where('ownerUid', '==', user.uid), where('localId', '==', boardId)));
  if (!existing.empty) {
    const record = normalizeRemote(existing.docs[0]);
    const memberRef = doc(client.db, COLLECTIONS.boards, record.id, COLLECTIONS.members, user.uid);
    if (!(await getDoc(memberRef)).exists()) await setDoc(memberRef, {
      uid:user.uid, email:normalEmail(user.email), role:'owner', status:'active', createdAt:serverTimestamp()
    });
    remoteBoards.set(record.id, record);
    activeCloudBoard = record;
    setCloudBoard(boardId, record);
    watchBoard(record);
    return;
  }
  const payload = boardPayload(board);
  if (!allowEmpty && !payload.screenshotIds.length && !payload.collectionIds.length) return;
  await createCloudBoard(board);
}

async function createCloudBoard(board) {
  const key = localId(board);
  if (pendingCreates.has(key)) return pendingCreates.get(key);
  const pending = createCloudBoardOnce(board).finally(() => pendingCreates.delete(key));
  pendingCreates.set(key, pending);
  return pending;
}

async function createCloudBoardOnce(board) {
  if (!user || !client || !board) return;
  localBoardId = localId(board);
  const { collection, addDoc, serverTimestamp, doc, setDoc, query, where, getDocs } = client.dbSdk;
  const previous = await getDocs(query(collection(client.db, COLLECTIONS.boards), where('ownerUid', '==', user.uid), where('localId', '==', localBoardId)));
  if (!previous.empty) {
    const record = normalizeRemote(previous.docs[0]);
    remoteBoards.set(record.id, record);
    activeCloudBoard = record;
    setCloudBoard(localBoardId, record);
    watchBoard(record);
    return record;
  }
  const payload = boardPayload(board);
  const ref = await addDoc(collection(client.db, COLLECTIONS.boards), {
    ownerUid:user.uid, localId:localBoardId, title:String(board.name || 'Saved board').slice(0, 120),
    ...payload, createdAt:serverTimestamp(), updatedAt:serverTimestamp()
  });
  await setDoc(doc(client.db, COLLECTIONS.boards, ref.id, COLLECTIONS.members, user.uid), {
    uid:user.uid, email:normalEmail(user.email), role:'owner', status:'active', createdAt:serverTimestamp()
  });
  const remote = { id:ref.id, cloudId:ref.id, localId:localBoardId, ownerUid:user.uid,
    name:String(board.name || 'Saved board').slice(0, 120), appIds:payload.screenshotIds, collectionIds:payload.collectionIds };
  remoteBoards.set(remote.id, remote);
  setCloudBoard(localBoardId, remote);
  watchBoard(remote);
  app()?.setCloudBoards?.([...remoteBoards.values()], user);
}

async function acceptInvites() {
  const email = normalEmail(user?.email);
  if (!email) return;
  const { collectionGroup, query, where, getDocs, doc, updateDoc, setDoc, serverTimestamp } = client.dbSdk;
  const invites = await getDocs(query(collectionGroup(client.db, COLLECTIONS.invites), where('invitedEmail', '==', email)));
  for (const invite of invites.docs) {
    const value = invite.data();
    const boardRef = invite.ref.parent.parent;
    if (!boardRef || !(value.status === 'pending' || (value.status === 'accepted' && value.acceptedBy === user.uid))) continue;
    if (value.status === 'pending') await updateDoc(invite.ref, { status:'accepted', acceptedBy:user.uid, acceptedAt:serverTimestamp() });
    const memberRef = doc(client.db, COLLECTIONS.boards, boardRef.id, COLLECTIONS.members, user.uid);
    if (!(await client.dbSdk.getDoc(memberRef)).exists()) {
      await setDoc(memberRef, { uid:user.uid, email, role:'member', status:'active', createdAt:serverTimestamp() });
    }
  }
}

async function loadBoards() {
  assertVerified();
  await acceptInvites();
  const { collectionGroup, query, where, getDocs, doc, getDoc, collection, setDoc, serverTimestamp } = client.dbSdk;
  const memberships = await getDocs(query(collectionGroup(client.db, COLLECTIONS.members), where('uid', '==', user.uid)));
  const records = [];
  for (const membership of memberships.docs) {
    const boardRef = membership.ref.parent.parent;
    if (!boardRef) continue;
    const result = await getDoc(doc(client.db, COLLECTIONS.boards, boardRef.id));
    if (result.exists()) records.push(normalizeRemote(result));
  }
  if (!records.length) {
    const owned = await getDocs(query(collection(client.db, COLLECTIONS.boards), where('ownerUid', '==', user.uid)));
    for (const result of owned.docs) {
      await setDoc(doc(client.db, COLLECTIONS.boards, result.id, COLLECTIONS.members, user.uid), {
        uid:user.uid, email:normalEmail(user.email), role:'owner', status:'active', createdAt:serverTimestamp()
      });
      records.push(normalizeRemote(result));
    }
  }
  remoteBoards.clear();
  for (const record of records) remoteBoards.set(record.id, record);
  app()?.setCloudBoards?.(records, user);
  const local = activeLocalBoard();
  const selectedId = localId(local);
  const selectedCloudId = local?.cloudId || local?.id;
  const selectedRemote = remoteBoards.get(selectedCloudId) || [...remoteBoards.values()].find(record => record.localId === selectedId);
  if (selectedRemote?.ownerUid === user.uid) {
    localBoardId = selectedId;
    activeCloudBoard = selectedRemote;
    setCloudBoard(selectedId, selectedRemote);
    await applyRemoteBoard(selectedRemote);
    watchBoard(activeCloudBoard);
  } else {
    activeCloudBoard = selectedRemote || null;
    if (activeCloudBoard) { await applyRemoteBoard(activeCloudBoard); watchBoard(activeCloudBoard); }
    else await ensureDefaultCloudBoard();
  }
  if (activeCloudBoard) app()?.setCloudBoards?.([...remoteBoards.values()], user);
  await renderMembers();
  setStatus(user.email || 'Signed in.');
}

async function syncBoard(board) {
  if (!ready || !user?.emailVerified || !activeCloudBoard?.id || !board) return;
  const target = activeCloudBoard;
  const ref = client.dbSdk.doc(client.db, COLLECTIONS.boards, target.id);
  const desired = boardPayload(board);
  let merged;
  await client.dbSdk.runTransaction(client.db, async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) throw new Error('This shared board was removed.');
    const current = snapshot.data();
    merged = {
      screenshotIds:mergeIdSet(current.screenshotIds, target.appIds, desired.screenshotIds, MAX_IDS.screenshots),
      collectionIds:mergeIdSet(current.collectionIds, target.collectionIds, desired.collectionIds, MAX_IDS.collections)
    };
    transaction.update(ref, { ...merged, updatedAt:client.dbSdk.serverTimestamp() });
  });
  if (activeCloudBoard?.id === target.id && merged) {
    activeCloudBoard = { ...target, appIds:merged.screenshotIds, collectionIds:merged.collectionIds };
    remoteBoards.set(target.id, activeCloudBoard);
    app()?.setCloudBoard?.(localId(board) || target.localId, activeCloudBoard);
  }
}

async function renderMembers() {
  const target = node('boardMembers');
  if (!target || !activeCloudBoard?.id || !client) return;
  setVisible('shareForm', activeCloudBoard.ownerUid === user?.uid);
  try {
    const { collection, getDocs, doc } = client.dbSdk;
    const base = doc(client.db, COLLECTIONS.boards, activeCloudBoard.id);
    target.replaceChildren();
    if (activeCloudBoard.ownerUid !== user?.uid) {
      const self = await client.dbSdk.getDoc(doc(client.db, COLLECTIONS.boards, activeCloudBoard.id, COLLECTIONS.members, user.uid));
      if (self.exists()) {
        const row = document.createElement('li');
        row.textContent = `${self.data().email || user.email} · shared member`;
        target.append(row);
      }
      return;
    }
    const [members, invites] = await Promise.all([
      getDocs(collection(base, COLLECTIONS.members)), getDocs(collection(base, COLLECTIONS.invites))
    ]);
    const visibleInvites = invites.docs.map(x => x.data()).filter(x => x.status === 'pending' || x.status === 'revoked');
    for (const item of [...members.docs.map(x => ({ ...x.data(), state:'member' })), ...visibleInvites.map(x => ({ ...x, state:x.status }))]) {
      const row = document.createElement('li');
      const stateLabel = item.state === 'pending' ? ' · invitation pending' : item.state === 'revoked' ? ' · invitation revoked' : '';
      row.textContent = `${item.email || item.invitedEmail || 'Member'}${stateLabel}${item.role === 'owner' ? ' · owner' : ''}`;
      target.append(row);
    }
  } catch (error) { setStatus(error?.message || 'Could not load board members.'); }
}

async function initialize() {
  let config;
  try {
    const response = await fetch(new URL('./firebase-config.json', import.meta.url), { cache:'no-store' });
    if (!response.ok) throw new Error('config unavailable');
    config = await response.json();
  } catch { showSetup('unavailable'); return; }
  if (!config || config.enabled !== true) { showSetup('disabled'); return; }
  if (config.projectId !== 'patchworkmd-hugging-app-prod') { showSetup('wrong-project'); return; }
  const required = ['apiKey', 'authDomain', 'projectId', 'appId'];
  if (required.some(key => typeof config[key] !== 'string' || !config[key].trim())) {
    showSetup('incomplete'); return;
  }
  try {
    const bundle = await import('./firebase-client.bundle.js?v=20260928-auth-2');
    client = bundle.initializeFirebase(config);
  } catch { showSetup('unavailable'); return; }
  ready = true;
  const { onAuthStateChanged } = client.authSdk;
  onAuthStateChanged(client.auth, async nextUser => {
    if (nextUser?.uid !== user?.uid) {
      unsubscribeBoard?.(); unsubscribeBoard = null;
      activeCloudBoard = null; remoteBoards.clear();
      app()?.setCloudBoards?.([], null);
    }
    user = nextUser;
    setVisible('accountSetup', false);
    setSignedInUI();
    if (!user) {
      unsubscribeBoard?.(); unsubscribeBoard = null;
      activeCloudBoard = null; remoteBoards.clear(); setVisible('shareForm', false);
      app()?.setCloudBoards?.([], null);
      node('boardMembers')?.replaceChildren(); setStatus('Sign in to sync your saved board.'); return;
    }
    if (!user.emailVerified) { setStatus('Verify your email before you use shared boards.'); return; }
    try { await loadBoards(); }
    catch (error) { setStatus(error?.message || 'Cloud sync could not load. Your local board is still available.'); }
  });
}

function bind() {
  node('accountButton')?.addEventListener('click', () => {
    const dialog = node('accountDialog');
    if (dialog && !dialog.open) dialog.showModal();
  });
  node('accountClose')?.addEventListener('click', () => node('accountDialog')?.close());
  node('authToggle')?.addEventListener('click', () => {
    const mode = node('authMode'); if (!mode) return;
    mode.value = mode.value === 'signup' ? 'signin' : 'signup';
    if (node('authSubmit')) node('authSubmit').textContent = mode.value === 'signup' ? 'Create account' : 'Sign in';
    const toggle = node('authToggle');
    if (toggle) {
      const signup = mode.value === 'signup';
      toggle.textContent = signup ? 'Already have an account? Sign in' : 'Create an account';
      toggle.setAttribute('aria-pressed', String(signup));
    }
  });
  node('googleSignIn')?.addEventListener('click', async () => {
    try {
      if (!ready) return;
      const provider = new client.authSdk.GoogleAuthProvider();
      await client.authSdk.signInWithPopup(client.auth, provider);
    } catch (error) { setStatus(error?.message || 'Google sign-in failed.'); }
  });
  node('emailForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    if (!ready) return;
    const email = normalEmail(node('email')?.value), password = node('password')?.value || '';
    try {
      if (node('authMode')?.value === 'signup') {
        const result = await client.authSdk.createUserWithEmailAndPassword(client.auth, email, password);
        await client.authSdk.sendEmailVerification(result.user);
        setStatus('Check your email and verify your address before you use shared boards.');
      } else {
        const result = await client.authSdk.signInWithEmailAndPassword(client.auth, email, password);
        if (!result.user.emailVerified) {
          await client.authSdk.sendEmailVerification(result.user);
          setStatus('Verify your email before you use shared boards. A new verification link was sent.');
        }
      }
    } catch (error) { setStatus(error?.message || 'Email sign-in failed.'); }
  });
  node('forgotPassword')?.addEventListener('click', async () => {
    const email = normalEmail(node('email')?.value);
    if (!ready || !email) { setStatus('Enter your email address first.'); return; }
    try { await client.authSdk.sendPasswordResetEmail(client.auth, email); setStatus('Password reset email sent.'); }
    catch (error) { setStatus(error?.message || 'Password reset could not be sent.'); }
  });
  node('resendVerification')?.addEventListener('click', async () => {
    if (!user) return;
    try {
      await user.reload();
      user = client.auth.currentUser;
      if (user?.emailVerified) {
        setSignedInUI(); await loadBoards();
      } else {
        await client.authSdk.sendEmailVerification(user);
        setStatus('Verification email sent.');
      }
    }
    catch (error) { setStatus(error?.message || 'Verification email could not be sent.'); }
  });
  node('signOut')?.addEventListener('click', async () => {
    try { if (client?.auth) await client.authSdk.signOut(client.auth); }
    catch (error) { setStatus(error?.message || 'Sign-out failed.'); }
  });
  node('shareForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    try {
      assertVerified();
      if (!activeCloudBoard?.id || activeCloudBoard.ownerUid !== user.uid) throw new Error('Only the board owner can invite people.');
      const email = normalEmail(node('shareEmail')?.value);
      if (!/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(email) || email === normalEmail(user.email)) throw new Error('Enter another person’s email address.');
      const { doc, setDoc, updateDoc, serverTimestamp } = client.dbSdk;
      // Email is the invite document ID so Firestore rules can bind acceptance to the verified email.
      const inviteRef = doc(client.db, COLLECTIONS.boards, activeCloudBoard.id, COLLECTIONS.invites, email);
      const existingInvite = await client.dbSdk.getDoc(inviteRef);
      if (existingInvite.exists()) {
        const decision = boardModel.invitationDecision(existingInvite.data().status);
        if (decision.action !== 'reissue') throw new Error(decision.message);
        await updateDoc(inviteRef, { status:'pending' });
      } else {
        await setDoc(inviteRef, {
          invitedEmail:email, status:'pending', createdAt:serverTimestamp(), createdBy:user.uid
        });
      }
      node('shareForm').reset();
      setStatus('Invitation recorded. Send the person a note; they must sign in with this verified email.');
      await renderMembers();
    } catch (error) { setStatus(error?.message || 'The invitation could not be sent.'); }
  });
  window.addEventListener('hugging:share-board-request', async () => {
    try {
      assertVerified();
      await ensureDefaultCloudBoard({ allowEmpty:true });
      if (activeCloudBoard?.ownerUid === user.uid) {
        setVisible('shareForm', true);
        node('shareEmail')?.focus();
        setStatus('This board is ready to share.');
      } else setStatus('Only the board owner can share this board.');
    } catch (error) { setStatus(error?.message || 'Sign in with a verified email to share this board.'); }
  });
  function selectCloudBoard(event, apply = false) {
    const changed = event.detail?.board || activeLocalBoard();
    const selectedCloudId = changed?.cloudId || changed?.remoteId || changed?.cloudBoardId || changed?.id;
    const selected = remoteBoards.get(selectedCloudId) || [...remoteBoards.values()].find(record => record.localId === localId(changed));
    if (selected) {
      activeCloudBoard = selected;
      localBoardId = localId(changed);
      watchBoard(activeCloudBoard);
      renderMembers();
      if (apply) void applyRemoteBoard(activeCloudBoard);
    } else if (activeCloudBoard) {
      activeCloudBoard = null;
      unsubscribeBoard?.(); unsubscribeBoard = null;
      setVisible('shareForm', false);
    }
  }
  window.addEventListener('hugging:board-select', event => selectCloudBoard(event, true));
  window.addEventListener('hugging:board-change', event => {
    if (applyingRemote) return;
    selectCloudBoard(event);
    const changed = event.detail?.board || activeLocalBoard();
    localBoardId = localId(changed);
    const sync = activeCloudBoard ? syncBoard(changed) : user?.emailVerified ? createCloudBoard(changed) : Promise.resolve();
    sync.catch(error => setStatus(error?.message || 'Cloud sync failed. Local changes are saved.'));
  });
}

export const accountSync = Object.freeze({ initialize, syncBoard, setCloudBoard, loadBoards });
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { bind(); initialize(); }, { once:true });
else { bind(); initialize(); }
