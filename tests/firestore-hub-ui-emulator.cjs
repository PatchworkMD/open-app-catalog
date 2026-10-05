const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {chromium}=require('playwright');

const root=path.resolve(__dirname,'..','site');
const origin='http://127.0.0.1:8765';
const projectId='demo-huggingapp-auth-review';
const authHost=process.env.FIREBASE_AUTH_EMULATOR_HOST;
const firestoreHost=process.env.FIRESTORE_EMULATOR_HOST;
function registeredLoopbackPort(value,name) {
  const match=/^127\.0\.0\.1:(\d+)$/.exec(value||'');
  const port=Number(match?.[1]);
  if(!match||!Number.isInteger(port)||port<1||port>65535) throw new Error(`${name} must be an explicitly registered 127.0.0.1:<port> emulator endpoint.`);
  return port;
}
const authPort=registeredLoopbackPort(authHost,'FIREBASE_AUTH_EMULATOR_HOST');
const firestorePort=registeredLoopbackPort(firestoreHost,'FIRESTORE_EMULATOR_HOST');
const authOrigin=`http://${authHost}`;
const mime={'.css':'text/css; charset=utf-8','.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.webp':'image/webp'};
const config={projectId,apiKey:`AIza${'A'.repeat(35)}`,authDomain:'127.0.0.1',appId:'1:web:local-emulator',emulators:{auth:{host:'127.0.0.1',port:authPort},firestore:{host:'127.0.0.1',port:firestorePort}}};
const googleToken=uid=>`${Buffer.from(JSON.stringify({alg:'none',typ:'JWT'})).toString('base64url')}.${Buffer.from(JSON.stringify({sub:uid,email:'google-owner@example.test',email_verified:true,iss:'https://accounts.google.com',aud:'synthetic-google-client'})).toString('base64url')}.`;

async function routes(page) {
  await page.addInitScript(()=>{
    window.__personalBootstrap={armed:false,held:false,completion:null};
    window.__holdPersonalBootstrap=async read=>{
      const snapshot=await read, gate=window.__personalBootstrap;
      if(!gate.armed) return snapshot;
      gate.armed=false; gate.held=true;
      await new Promise(resolve=>{gate.release=resolve;});
      return snapshot;
    };
    window.__boardCreation={armed:false,held:false,completion:null};
    window.__holdBoardCreation=async create=>{
      const id=await create,gate=window.__boardCreation;
      if(!gate.armed) return id;
      gate.armed=false;gate.held=true;
      await new Promise(resolve=>{gate.release=resolve;});
      return id;
    };
  });
  page.on('request',request=>{
    const url=new URL(request.url());
    if(url.origin===authOrigin) {
      page.__authRequests=page.__authRequests||[];
      page.__authRequests.push(url.pathname);
    }
  });
  page.on('requestfailed',request=>{
    if(new URL(request.url()).origin===authOrigin) {
      page.__authFailures=page.__authFailures||[];
      page.__authFailures.push(`request failed ${new URL(request.url()).pathname}: ${request.failure()?.errorText}`);
    }
  });
  page.on('response',async response=>{
    const url=new URL(response.url());
    if(url.origin===authOrigin&&response.status()>=400) {
      let message=''; try { message=(await response.json()).error?.message||''; } catch {}
      page.__authFailures=page.__authFailures||[];
      page.__authFailures.push(`${response.status()} ${url.pathname}: ${message}`);
    }
    if(url.origin===`http://127.0.0.1:${firestorePort}`&&response.status()>=400) {
      let message=''; try { message=(await response.text()).slice(0,180); } catch {}
      page.__firestoreFailures=page.__firestoreFailures||[];
      page.__firestoreFailures.push(`${response.status()} ${url.pathname}: ${message}`);
    }
  });
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin===origin) {
      if(url.pathname==='/firebase-config.json')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(config)});
      try {
        const rel=url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname);
        const file=path.resolve(root,`.${rel}`);
        if(file===root||!file.startsWith(`${root}${path.sep}`))return route.fulfill({status:403,body:'blocked path'});
        let body=await fs.readFile(file);
        if(url.pathname==='/cloud-boards.mjs') {
          // Hold the real SDK result at the personal-index boundary; getDoc uses Listen,
          // not the transaction-only batchGet transport. Observe the actual auth completion.
          body=body.toString()
            .replace('await state.api.getDoc(indexRef);','await window.__holdPersonalBootstrap(state.api.getDoc(indexRef));')
            .replace('void handleAuth(user);','const completion=handleAuth(user); if(window.__personalBootstrap.armed && user?.emailVerified) window.__personalBootstrap.completion=completion; void completion;')
            .replace('const id = await makeBoard(title);','const id = await window.__holdBoardCreation(makeBoard(title));')
            .replace("hub.querySelector('#ha-create-board')?.addEventListener('submit', createBoard);","hub.querySelector('#ha-create-board')?.addEventListener('submit',event=>{const completion=createBoard(event);if(window.__boardCreation.armed)window.__boardCreation.completion=completion;});");
        }
        return route.fulfill({status:200,contentType:mime[path.extname(file)]||'application/octet-stream',body});
      } catch { return route.fulfill({status:404,body:'not found'}); }
    }
    if(url.origin==='https://www.gstatic.com'&&url.pathname.startsWith('/firebasejs/12.19.0/'))return route.continue();
    if(url.origin===authOrigin||url.origin===`http://127.0.0.1:${firestorePort}`) {
      try {
        const response=await route.fetch({timeout:30000});
        return route.fulfill({response});
      } catch(error) { return route.fulfill({status:502,body:`local emulator proxy failed: ${error.message}`}); }
    }
    return route.abort('blockedbyclient');
  });
}

async function verificationCode(email) {
  const response=await fetch(`${authOrigin}/emulator/v1/projects/${projectId}/oobCodes`);
  assert.equal(response.ok,true,`Auth Emulator OOB endpoint returned ${response.status}`);
  const payload=await response.json();
  const record=(payload.oobCodes||[]).find(entry=>entry.email?.toLowerCase()===email.toLowerCase()&&
    (entry.operation==='VERIFY_EMAIL'||entry.requestType==='VERIFY_EMAIL'));
  assert.ok(record?.oobCode,'Auth Emulator did not expose a verification code for the synthetic account');
  return record.oobCode;
}

async function signUpAndVerify(page,email) {
  await page.locator('nav .account-nav').click();
  await page.locator('#ha-email').fill(email);
  await page.locator('#ha-password').fill('SyntheticPass-2026!');
  await page.locator('#ha-auth-actions [data-ha="create"]').click();
  await page.waitForFunction(()=>{
    const status=document.querySelector('#ha-auth-status');
    return status?.textContent.includes('Account created.')||status?.classList.contains('error');
  },undefined,{timeout:15000}).catch(async()=>{throw new Error(`Sign-up did not settle: ${await page.locator('#ha-auth-status').textContent()}`);});
  const status=await page.locator('#ha-auth-status').textContent();
  assert.match(status,/Account created\./,`Sign-up failed: ${status}; requests=${(page.__authRequests||[]).join(',')}; auth=${(page.__authFailures||[]).join(' | ')}`);
  const code=await verificationCode(email);
  await page.evaluate(async actionCode=>{
    const [appSdk,authSdk]=await Promise.all([
      import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js')
    ]);
    const auth=authSdk.getAuth(appSdk.getApps()[0]);
    await authSdk.applyActionCode(auth,actionCode);
    await authSdk.reload(auth.currentUser);
  },code);
  await page.locator('#ha-account-ready [data-ha="refresh-user"]').click();
  await page.locator('#hugging-cloud-board-hub h2').getByText('Your boards').waitFor();
  const user=await page.evaluate(async()=>{
    const appSdk=await import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js');
    const authSdk=await import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js');
    const current=authSdk.getAuth(appSdk.getApps()[0]).currentUser;
    const token=await authSdk.getIdTokenResult(current);
    return {uid:current.uid,verified:current.emailVerified,tokenVerified:token.claims.email_verified};
  });
  assert.equal(user.verified,true,'Verified email state was not refreshed in Firebase Auth');
  assert.equal(user.tokenVerified,true,'Verified-email token claim was not refreshed before Firestore access');
  return user.uid;
}

async function signInSyntheticGoogle(page,uid) {
  await page.locator('nav .account-nav').click();
  await page.evaluate(async token=>{
    const [appSdk,authSdk]=await Promise.all([
      import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js')
    ]);
    const auth=authSdk.getAuth(appSdk.getApps()[0]);
    const credential=authSdk.GoogleAuthProvider.credential(token);
    await authSdk.signInWithCredential(auth,credential);
  },googleToken(uid));
  await page.locator('#hugging-cloud-board-hub h2').getByText('Your boards').waitFor();
  const identity=await page.evaluate(async()=>{
    const [appSdk,authSdk]=await Promise.all([
      import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js')
    ]);
    const user=authSdk.getAuth(appSdk.getApps()[0]).currentUser;
    const token=await authSdk.getIdTokenResult(user);
    return {uid:user.uid,email:user.email,verified:user.emailVerified,tokenVerified:token.claims.email_verified,
      provider:user.providerData.find(item=>item.providerId==='google.com')?.providerId,
      providerUid:user.providerData.find(item=>item.providerId==='google.com')?.uid};
  });
  assert.equal(identity.providerUid,uid,'Synthetic Google provider subject was not preserved as provider identity');
  assert.equal(identity.email,'google-owner@example.test');
  assert.equal(identity.provider,'google.com','Synthetic Google credential did not establish Google provider identity');
  assert.equal(identity.verified,true);
  assert.equal(identity.tokenVerified,true);
  await page.locator('.account-dialog [data-ha="close"]').click();
  return identity;
}


async function inviteByEmail(page,email) {
  await page.locator('#ha-invite-form input[name="email"]').fill(email);
  await page.locator('#ha-invite-form button[type="submit"]').click();
  await page.locator('.invite-link input').waitFor({timeout:8000}).catch(async()=>{
    const form=await page.locator('#ha-invite-form input[name="email"]').evaluate(input=>({value:input.value,valid:input.checkValidity(),board:document.querySelector('[data-ha="board-select"]')?.selectedOptions[0]?.textContent,submits:window.__inviteSubmits}));
    throw new Error(`Invite creation did not render its link: ${JSON.stringify(form)}; ${await page.locator('#hugging-cloud-board-hub').innerText()}; console=${(page.__consoleErrors||[]).join(' | ')}`);
  });
  return page.locator('.invite-link input').inputValue();
}

async function waitForBoardOption(page,boardId,present=true) {
  await page.waitForFunction(({id,shouldExist})=>{
    const options=[...document.querySelectorAll('#hugging-cloud-board-hub [data-ha="board-select"] option')];
    return options.some(option=>option.value===id)===shouldExist;
  },{id:boardId,shouldExist:present});
}

async function main() {
  const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'});
  const errors=[];
  try {
    const ownerContext=await browser.newContext();
    await ownerContext.addInitScript(()=>localStorage.setItem('oac-board',JSON.stringify(['synthetic-import-screen'])));
    const owner=await ownerContext.newPage();
    owner.on('pageerror',error=>errors.push(error.message));
    await routes(owner);
    await owner.goto(`${origin}/#boards`);
    await owner.waitForFunction(()=>document.querySelector('#ha-auth-actions')?.hidden===false,undefined,{timeout:10000}).catch(async()=>{
      throw new Error(`Account setup did not initialize: ${await owner.locator('#ha-auth-status').textContent()}; ${errors.join(' | ')}`);
    });
    const ownerUid=await signUpAndVerify(owner,'board-owner@example.test');

    const hub=owner.locator('#hugging-cloud-board-hub');
    const personalId=`personal-${ownerUid}`;
    await owner.waitForFunction(()=>document.querySelector('#hugging-cloud-board-hub [data-ha="import-device"]')!==null,undefined,{timeout:10000})
      .catch(async()=>{throw new Error(`Personal board hub did not expose Import: ${await hub.innerText()}; errors=${errors.join(' | ')}; firestore=${(owner.__firestoreFailures||[]).join(' | ')}`);});
    await hub.locator('[data-ha="import-device"]').click();
    await hub.getByRole('status').getByText('Merged 1 browser save',{exact:false}).waitFor();
    const imported=await owner.evaluate(async id=>{
      const appSdk=await import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js');
      const authSdk=await import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js');
      const dbSdk=await import('https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js');
      const db=dbSdk.getFirestore(appSdk.getApps()[0]);
      const snap=await dbSdk.getDoc(dbSdk.doc(db,'boards',id,'items','screen--synthetic-import-screen'));
      return snap.exists()&&snap.data().itemId==='synthetic-import-screen'&&authSdk.getAuth(appSdk.getApps()[0]).currentUser.emailVerified;
    },personalId);
    assert.equal(imported,true,'Import button did not create the owner-only saved item in Firestore Emulator');
    await owner.locator('nav .account-nav').click();
    await owner.locator('#ha-account-ready [data-ha="signout"]').click();
    await owner.waitForFunction(()=>document.querySelector('#hugging-cloud-board-hub')?.textContent.includes('Device saves remain separate'));
    assert.equal(await owner.evaluate(()=>localStorage.getItem('oac-board')),JSON.stringify(['synthetic-import-screen']),
      'Sign-out must retain device saves');
    assert.equal(await owner.locator('#hugging-cloud-board-hub [data-ha="board-select"]').count(),0,
      'Sign-out must restore device-only hub state');
    console.log('PASS rendered sign-out preserves device-only saves');
    await owner.locator('nav .account-nav').click();
    await owner.locator('#ha-email').fill('board-owner@example.test');
    await owner.locator('#ha-password').fill('SyntheticPass-2026!');
    await owner.locator('#ha-email-form button[type="submit"]').click();
    await hub.getByRole('heading',{name:'Your boards'}).waitFor();
    await hub.locator('[data-ha="import-device"]').waitFor();
    assert.equal(await owner.evaluate(()=>localStorage.getItem('oac-board')),JSON.stringify(['synthetic-import-screen']),
      'Signing back in must preserve device saves without silently importing them');
    await owner.locator('.account-dialog [data-ha="close"]').click();

    await owner.evaluate(()=>Object.assign(window.__personalBootstrap,{armed:true,held:false,completion:null}));
    await owner.locator('nav .account-nav').click();
    await owner.locator('#ha-account-ready [data-ha="signout"]').click();
    await owner.waitForFunction(()=>document.querySelector('#ha-auth-actions')?.hidden===false);
    await owner.locator('.account-dialog').waitFor({state:'hidden'});
    await owner.locator('nav .account-nav').click();
    await owner.locator('#ha-email').fill('board-owner@example.test');
    await owner.locator('#ha-password').fill('SyntheticPass-2026!');
    await owner.locator('#ha-email-form button[type="submit"]').click();
    await owner.waitForFunction(()=>window.__personalBootstrap.held);
    await owner.locator('[data-ha="signout"]').click();
    await owner.waitForFunction(()=>document.querySelector('#hugging-cloud-board-hub')?.textContent.includes('Device saves remain separate'));
    await owner.evaluate(async()=>{
      const gate=window.__personalBootstrap;
      gate.release();
      await gate.completion;
    });
    await owner.waitForFunction(()=>document.querySelector('#hugging-cloud-board-hub')?.textContent.includes('Device saves remain separate'));
    assert.equal(await owner.locator('#hugging-cloud-board-hub [data-ha="board-select"]').count(),0,
      'A released stale personal-board bootstrap must not restore the signed-out board UI');
    assert.equal(await owner.evaluate(()=>localStorage.getItem('oac-board')),JSON.stringify(['synthetic-import-screen']),
      'A released stale bootstrap must not replace signed-out device saves');
    console.log('PASS delayed personal-board bootstrap stays isolated after sign-out');
    await owner.locator('nav .account-nav').click();
    await owner.locator('#ha-email').fill('board-owner@example.test');
    await owner.locator('#ha-password').fill('SyntheticPass-2026!');
    await owner.locator('#ha-email-form button[type="submit"]').click();
    await hub.getByRole('heading',{name:'Your boards'}).waitFor();
    await hub.locator('[data-ha="import-device"]').waitFor();
    assert.equal(await owner.evaluate(()=>localStorage.getItem('oac-board')),JSON.stringify(['synthetic-import-screen']),
      'Signing back in must preserve device saves without silently importing them');
    await owner.locator('.account-dialog [data-ha="close"]').click();
    const googleContext=await browser.newContext();
    const google=await googleContext.newPage();
    google.on('pageerror',error=>errors.push(error.message));
    await routes(google);
    await google.goto(`${origin}/#boards`);
    await google.waitForFunction(()=>document.querySelector('#ha-auth-actions')?.hidden===false,undefined,{timeout:10000});
    const googleIdentity=await signInSyntheticGoogle(google,'synthetic-google-uid');
    const googleBoardId=`personal-${googleIdentity.uid}`;
    await google.waitForFunction(id=>[...document.querySelectorAll('#hugging-cloud-board-hub [data-ha="board-select"] option')].some(option=>option.value===id),googleBoardId);
    const boardBootstrap=await google.evaluate(async id=>{
      const [appSdk,authSdk,dbSdk]=await Promise.all([
        import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js'),
        import('https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js')
      ]);
      const app=appSdk.getApps()[0],db=dbSdk.getFirestore(app),uid=authSdk.getAuth(app).currentUser.uid;
      const [board,member,index]=await Promise.all([
        dbSdk.getDoc(dbSdk.doc(db,'boards',id)),
        dbSdk.getDoc(dbSdk.doc(db,'boards',id,'members',uid)),
        dbSdk.getDoc(dbSdk.doc(db,'users',uid,'boards',id))
      ]);
      return {owner:board.data()?.ownerUid,memberRole:member.data()?.role,indexRole:index.data()?.role};
    },googleBoardId);
    assert.deepEqual(boardBootstrap,{owner:googleIdentity.uid,memberRole:'owner',indexRole:'owner'},
      'Google sign-in must bootstrap the provider user’s own personal board');
    await google.evaluate(async id=>{
      const [appSdk,authSdk,dbSdk]=await Promise.all([
        import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js'),
        import('https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js')
      ]);
      const app=appSdk.getApps()[0], db=dbSdk.getFirestore(app), uid=authSdk.getAuth(app).currentUser.uid;
      await dbSdk.setDoc(dbSdk.doc(db,'boards',id,'items','screen--google-synthetic'),{kind:'screen',itemId:'google-synthetic',addedBy:uid,addedAt:dbSdk.serverTimestamp()});
    },googleBoardId);
    const privateReadCode=await google.evaluate(async id=>{
      const [appSdk,dbSdk]=await Promise.all([
        import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js')
      ]);
      try {
        await dbSdk.getDoc(dbSdk.doc(dbSdk.getFirestore(appSdk.getApps()[0]),'boards',id,'items','screen--synthetic-import-screen'));
        return null;
      } catch(error) { return error.code; }
    },personalId);
    assert.equal(privateReadCode,'permission-denied',"Google account must not read the email owner's private item");
    assert.equal(await google.evaluate(async id=>{
      const [appSdk,dbSdk]=await Promise.all([
        import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js')
      ]);
      return (await dbSdk.getDoc(dbSdk.doc(dbSdk.getFirestore(appSdk.getApps()[0]),'boards',id,'items','screen--google-synthetic'))).exists();
    },googleBoardId),true,'Google user could not read its own private-board item');
    await fs.mkdir('/tmp/firstmate-workers-20261001',{recursive:true});
    await google.screenshot({path:'/tmp/firstmate-workers-20261001/firestore-hub-google-personal-board.png',fullPage:true});
    await googleContext.close();

    await owner.evaluate(()=>Object.assign(window.__boardCreation,{armed:true,held:false,completion:null}));
    await hub.locator('#ha-create-board input[name="title"]').fill('UI shared board');
    await hub.locator('#ha-create-board button[type="submit"]').click();
    await owner.waitForFunction(()=>window.__boardCreation.held);
    await owner.waitForFunction(()=>[...document.querySelectorAll('#hugging-cloud-board-hub [data-ha="board-select"] option')]
      .some(option=>option.textContent.includes('UI shared board')));
    const boardId=await hub.locator('[data-ha="board-select"] option').evaluateAll(options=>options.find(option=>option.textContent.includes('UI shared board')).value);
    await hub.locator('[data-ha="board-select"]').selectOption(boardId);
    await hub.locator('#ha-invite-form').waitFor();
    await owner.evaluate(()=>{
      window.__hubRenderCount=0;
      new MutationObserver(()=>window.__hubRenderCount++).observe(document.querySelector('#hugging-cloud-board-hub'),{childList:true,subtree:true});
    });
    const titleInput=hub.locator('#ha-create-board input[name="title"]');
    await titleInput.fill('Continuity title draft');
    await titleInput.evaluate(input=>{input.focus();input.setSelectionRange(4,13,'forward');});
    await owner.evaluate(async()=>{
      const gate=window.__boardCreation;
      gate.release();
      await gate.completion;
    });
    await owner.evaluate(async id=>{
      const [appSdk,authSdk,dbSdk]=await Promise.all([
        import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js'),
        import('https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js')
      ]);
      const app=appSdk.getApps()[0],uid=authSdk.getAuth(app).currentUser.uid,db=dbSdk.getFirestore(app);
      await dbSdk.setDoc(dbSdk.doc(db,'boards',id,'items','screen--continuity-title'),{kind:'screen',itemId:'continuity-title',addedBy:uid,addedAt:dbSdk.serverTimestamp()});
    },boardId);
    await owner.waitForFunction(()=>window.__hubRenderCount>0);
    assert.deepEqual(await titleInput.evaluate(input=>({value:input.value,focused:document.activeElement===input,start:input.selectionStart,end:input.selectionEnd})),
      {value:'Continuity title draft',focused:true,start:4,end:13},'Async snapshot must preserve title draft, focus, and selection');
    const inviteInput=hub.locator('#ha-invite-form input[name="email"]');
    await inviteInput.fill('draft@example.test');
    await inviteInput.focus();
    await owner.evaluate(()=>{window.__hubRenderCount=0;});
    await owner.evaluate(async id=>{
      const [appSdk,authSdk,dbSdk]=await Promise.all([
        import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js'),
        import('https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js')
      ]);
      const app=appSdk.getApps()[0],uid=authSdk.getAuth(app).currentUser.uid,db=dbSdk.getFirestore(app);
      await dbSdk.setDoc(dbSdk.doc(db,'boards',id,'items','screen--continuity-invite'),{kind:'screen',itemId:'continuity-invite',addedBy:uid,addedAt:dbSdk.serverTimestamp()});
    },boardId);
    await owner.waitForFunction(()=>window.__hubRenderCount>0);
    assert.deepEqual(await inviteInput.evaluate(input=>({value:input.value,focused:document.activeElement===input})),
      {value:'draft@example.test',focused:true},'Async snapshot must preserve invite draft and focus');
    await owner.locator('nav .account-nav').focus();
    await owner.evaluate(()=>{window.__hubRenderCount=0;});
    await owner.evaluate(async id=>{
      const [appSdk,authSdk,dbSdk]=await Promise.all([
        import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js'),
        import('https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js')
      ]);
      const app=appSdk.getApps()[0],uid=authSdk.getAuth(app).currentUser.uid,db=dbSdk.getFirestore(app);
      await dbSdk.setDoc(dbSdk.doc(db,'boards',id,'items','screen--continuity-focus'),{kind:'screen',itemId:'continuity-focus',addedBy:uid,addedAt:dbSdk.serverTimestamp()});
    },boardId);
    await owner.waitForFunction(()=>window.__hubRenderCount>0);
    assert.equal(await owner.locator('nav .account-nav').evaluate(input=>document.activeElement===input),
      true,'Snapshot must not steal focus from another UI control');
    await hub.locator('[data-ha="board-select"]').selectOption(personalId);
    await owner.waitForFunction(id=>document.querySelector('#hugging-cloud-board-hub [data-ha="board-select"]')?.value===id,personalId);
    assert.deepEqual(await hub.locator('#ha-create-board input[name="title"]').inputValue(),'',
      'Changing active board must clear the previous-board title draft');
    assert.deepEqual(await hub.locator('#ha-invite-form input[name="email"]').inputValue(),'',
      'Changing active board must clear the previous-board invite draft');
    await owner.screenshot({path:'/tmp/firstmate-workers-20261001/firestore-hub-form-continuity.png',fullPage:true});
    await hub.locator('[data-ha="board-select"]').selectOption(boardId);
    await owner.waitForFunction(id=>document.querySelector('#hugging-cloud-board-hub [data-ha="board-select"]')?.value===id,boardId);

    const email='board-member@example.test';
    await inviteByEmail(owner,'Board-Member@Example.Test');
    await hub.locator('[data-ha="revoke-invite"]').waitFor();
    await hub.locator('[data-ha="revoke-invite"]').click();
    await hub.getByText('No pending invites.').waitFor();
    console.log('PASS rendered Revoke control persists revocation');

    const inviteUrl=await inviteByEmail(owner,email);
    await owner.evaluate(async boardId=>{
      const [appSdk,dbSdk]=await Promise.all([
        import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js')
      ]);
      const db=dbSdk.getFirestore(appSdk.getApps()[0]);
      await dbSdk.updateDoc(dbSdk.doc(db,'boards',boardId),{title:'Renamed after invitation',updatedAt:dbSdk.serverTimestamp()});
    },boardId);
    const memberContext=await browser.newContext();
    const member=await memberContext.newPage();
    member.on('pageerror',error=>errors.push(error.message));
    await routes(member);
    await member.goto(inviteUrl);
    const memberUid=await signUpAndVerify(member,email);
    const memberHub=member.locator('#hugging-cloud-board-hub');
    await memberHub.locator('[data-ha="accept-invite"]').waitFor({timeout:10000}).catch(async()=>{
      throw new Error(`Invite acceptance UI missing: ${await memberHub.innerText()}; console=${(member.__consoleErrors||[]).join(' | ')}`);
    });
    await memberHub.locator('[data-ha="accept-invite"]').click();
    await waitForBoardOption(member,boardId);
    await member.waitForFunction(async id=>{
      const [appSdk,authSdk,dbSdk]=await Promise.all([
        import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js'),
        import('https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js')
      ]);
      const app=appSdk.getApps()[0], db=dbSdk.getFirestore(app), uid=authSdk.getAuth(app).currentUser?.uid;
      if (!uid) return false;
      const index=await dbSdk.getDoc(dbSdk.doc(db,'users',uid,'boards',id));
      return index.exists()&&index.data().title==='Renamed after invitation';
    },boardId,{timeout:10000});
    const accepted=await member.evaluate(async boardId=>{
      const [appSdk,authSdk,dbSdk]=await Promise.all([
        import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js'),
        import('https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js')
      ]);
      const app=appSdk.getApps()[0], db=dbSdk.getFirestore(app), uid=authSdk.getAuth(app).currentUser.uid;
      const index=await dbSdk.getDoc(dbSdk.doc(db,'users',uid,'boards',boardId));
      const member=await dbSdk.getDoc(dbSdk.doc(db,'boards',boardId,'members',uid));
      return {title:index.exists()?index.data().title:null,email:member.exists()?member.data().email:null};
    },boardId);
    assert.equal(accepted.title,'Renamed after invitation','Accept must refresh cached invite title after membership is granted');
    assert.equal(accepted.email,email,'Accepted member email must use normalized form');
    await owner.locator(`[data-ha="board-select"]`).selectOption(boardId);
    const remove=hub.locator(`[data-ha="remove-member"][data-id="${memberUid}"]`);
    await remove.waitFor();
    await remove.click();
    await remove.waitFor({state:'detached'});
    await waitForBoardOption(member,boardId,false);
    console.log('PASS rendered Accept and Remove controls update reciprocal memberships');

    const secondInvite=await inviteByEmail(owner,'Board-Member@Example.Test');
    await member.goto(secondInvite);
    await memberHub.locator('[data-ha="accept-invite"]').waitFor();
    await memberHub.locator('[data-ha="accept-invite"]').click();
    await waitForBoardOption(member,boardId);
    await memberHub.locator('[data-ha="board-select"]').selectOption(boardId);
    await memberHub.locator('[data-ha="leave-board"]').waitFor();
    await memberHub.locator('[data-ha="leave-board"]').click();
    await waitForBoardOption(member,boardId,false);
    console.log('PASS rendered Leave control removes member and private index');
    // Keep a real collaborator and rendered saved reference on A when Auth directly replaces A with B.
    const boundaryInvite=await inviteByEmail(owner,email);
    await member.goto(boundaryInvite);
    await memberHub.locator('[data-ha="accept-invite"]').waitFor();
    await memberHub.locator('[data-ha="accept-invite"]').click();
    await hub.locator(`[data-ha="remove-member"][data-id="${memberUid}"]`).waitFor();
    const priorItemId=await owner.evaluate(async id=>{
      const catalog=await (await fetch('/data.json')).json();
      const itemId=catalog.screens[0].id;
      const [appSdk,authSdk,dbSdk]=await Promise.all([
        import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js'),
        import('https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js')
      ]);
      const app=appSdk.getApps()[0],uid=authSdk.getAuth(app).currentUser.uid;
      await dbSdk.setDoc(dbSdk.doc(dbSdk.getFirestore(app),'boards',id,'items',`screen--${encodeURIComponent(itemId)}`),
        {kind:'screen',itemId,addedBy:uid,addedAt:dbSdk.serverTimestamp()});
      return itemId;
    },boardId);
    await owner.locator(`[data-view="${priorItemId}"]`).waitFor();
    await hub.locator('#ha-create-board input[name="title"]').fill('UID boundary draft');
    await hub.locator('#ha-invite-form input[name="email"]').fill('private-uid-draft@example.test');
    await owner.evaluate(()=>Object.assign(window.__personalBootstrap,{armed:true,held:false,completion:null}));
    await signInSyntheticGoogle(owner,'synthetic-google-uid');
    await owner.waitForFunction(()=>window.__personalBootstrap.held);
    const assertPriorPrivateStateAbsent=async()=>{
      const privateText=await hub.innerText();
      assert.equal(privateText.includes('board-owner@example.test'),false,'B must not render A identity');
      assert.equal(privateText.includes(email),false,'B must not render A collaborator email');
      assert.equal(await hub.locator(`[data-ha="board-select"] option[value="${boardId}"]`).count(),0,
        'A private board must not remain selectable after direct Auth replacement');
      assert.equal(await owner.locator(`[data-view="${priorItemId}"]`).count(),0,'A saved reference must not remain rendered');
      assert.equal(await hub.locator('.invite-link').count(),0,'A private invitation link must not remain rendered');
      assert.equal(await hub.locator('#ha-create-board input[name="title"]').inputValue(),'','A title draft must not cross UID');
      const inviteDraft=hub.locator('#ha-invite-form input[name="email"]');
      assert.equal(await inviteDraft.count()===0 || await inviteDraft.inputValue()==='',true,'A invite draft must not cross UID');
      assert.equal(await hub.locator('#ha-create-board input[name="title"]').evaluate(input=>document.activeElement===input),
        false,'A editor focus must not cross UID');
    };
    await assertPriorPrivateStateAbsent();
    await owner.locator('nav .account-nav').click();
    await owner.locator('#ha-account-ready [data-ha="signout"]').click();
    await owner.waitForFunction(()=>document.querySelector('#hugging-cloud-board-hub')?.textContent.includes('Device saves remain separate'));
    await owner.evaluate(async()=>{
      const gate=window.__personalBootstrap;
      gate.release();
      await gate.completion;
    });
    assert.equal(await hub.locator('[data-ha="board-select"]').count(),0,'Stale B bootstrap must not revive board controls');
    assert.equal(await hub.locator('[data-ha="remove-member"]').count(),0,'Stale B bootstrap must not revive A members');
    assert.equal(await hub.locator('.invite-link').count(),0,'Stale B bootstrap must not revive A invitation link');
    assert.equal((await hub.innerText()).includes(email),false,'A collaborator email must remain absent after stale B completion');
    assert.equal(await owner.locator(`[data-view="${priorItemId}"]`).count(),0,'A private saved reference must remain absent after stale completion');
    console.log('PASS direct verified-account replacement clears private state before held bootstrap and after stale completion');
    assert.deepEqual(errors,[],'Browser surfaced uncaught errors: '+errors.join('; '));
  } finally { await browser.close(); }
}

main().catch(error=>{console.error(error);process.exitCode=1;});
