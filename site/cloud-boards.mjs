const PROJECT_ID = '[redacted-gcp-project]';
const SDK = 'https://www.gstatic.com/firebasejs/12.19.0';

export const normalizeEmail = value => String(value || '').trim().toLowerCase();
export const itemDocumentId = (kind, id) => `${kind}--${encodeURIComponent(String(id))}`;
export const firebaseConfigReady = (value, allowDemoProject = false) => Boolean(value &&
  (value.projectId === PROJECT_ID || (allowDemoProject && /^demo-[a-z0-9-]+$/.test(value.projectId))) &&
  ['apiKey', 'authDomain', 'appId'].every(key => typeof value[key] === 'string' && value[key].trim()));

function localEmulatorConfig(config) {
  const emulator = config?.emulators;
  if (!['localhost','127.0.0.1'].includes(location.hostname) || location.protocol !== 'http:' ||
      !/^demo-[a-z0-9-]+$/.test(config?.projectId || '') || emulator?.auth?.host !== '127.0.0.1' ||
      emulator?.firestore?.host !== '127.0.0.1') return null;
  const authPort = Number(emulator.auth.port), firestorePort = Number(emulator.firestore.port);
  if (![authPort,firestorePort].every(port => Number.isInteger(port) && port > 0 && port < 65536)) return null;
  return {authPort,firestorePort};
}

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const errorText = error => ({
  'auth/operation-not-allowed':'That sign-in method is not enabled for this Firebase project yet.',
  'auth/unauthorized-domain':'This website is not yet authorized for Firebase sign-in.',
  'auth/email-already-in-use':'An account already uses that email. Sign in instead.',
  'auth/invalid-credential':'The email or password is incorrect.',
  'auth/weak-password':'Use a stronger password.',
  'auth/popup-blocked':'The sign-in window was blocked. Try again or use email sign-in.',
  'permission-denied':'Firebase denied this action. Check the deployed board rules and membership.',
  'unavailable':'Firebase is temporarily unavailable. Try again when you are online.'
}[error?.code] || 'That action did not finish. Check the account and try again.');

function start() {
  const nav = document.querySelector('nav');
  const content = document.querySelector('#content');
  if (!nav || !content) return;

  const accountButton = document.createElement('button');
  accountButton.className = 'account-nav';
  accountButton.type = 'button';
  accountButton.textContent = 'Account';
  accountButton.setAttribute('aria-haspopup', 'dialog');
  nav.append(accountButton);

  const dialog = document.createElement('dialog');
  dialog.className = 'account-dialog';
  dialog.setAttribute('aria-labelledby', 'ha-account-title');
  dialog.innerHTML = `<div class="dialogbar"><h2 id="ha-account-title">Hugging App account</h2><button type="button" data-ha="close">Close ×</button></div>
    <p id="ha-auth-status" class="cloud-note" role="status" aria-live="polite">Checking account setup…</p>
    <div id="ha-auth-actions" class="account-form" hidden>
      <button type="button" class="cloud-primary" data-ha="google">Continue with Google</button>
      <form id="ha-email-form">
        <label>Email<input id="ha-email" type="email" autocomplete="email" required></label>
        <label>Password<input id="ha-password" type="password" autocomplete="current-password" minlength="8" required></label>
        <div class="cloud-actions"><button type="submit">Sign in</button><button type="button" data-ha="create">Create account</button></div>
        <button class="text-action" type="button" data-ha="reset">Reset password</button>
      </form>
    </div>
    <div id="ha-account-ready" class="account-form" hidden>
      <p id="ha-signed-in-as"></p>
      <button type="button" data-ha="verify" hidden>Resend verification email</button>
      <button type="button" data-ha="refresh-user" hidden>I've verified my email</button>
      <button type="button" data-ha="signout">Sign out</button>
    </div>`;
  document.body.append(dialog);

  const state = {
    api:null, auth:null, db:null, user:null, ready:false, setupMessage:'', authGeneration:0,
    refs:[], activeBoardId:'', itemDocs:[], listeners:[], error:'', inviteLink:'', inviteEmail:'',
    draftTitleRevision:0,
    incoming:[], pending:[], members:[], activeTitle:'', notice:'', draftTitle:'', draftInvite:'', mutationObserver:null
  };

  const authStatus = document.querySelector('#ha-auth-status');
  const authActions = document.querySelector('#ha-auth-actions');
  const accountReady = document.querySelector('#ha-account-ready');
  const hubId = 'hugging-cloud-board-hub';
  const signIn = () => { dialog.showModal(); };

  function cancelListeners() { for (const stop of state.listeners.splice(0)) stop(); }
  function setStatus(message, error = false) {
    authStatus.textContent = message;
    authStatus.classList.toggle('error', error);
  }
  function listen(unsubscribe) { state.listeners.push(unsubscribe); }

  function makeHub() {
    const section = document.createElement('section');
    section.id = hubId;
    section.className = 'cloud-hub';
    section.setAttribute('aria-labelledby', 'cloud-hub-title');
    return section;
  }

  function renderCatalogBoard(render) {
    const hub=content.querySelector(`#${hubId}`);
    const sameContext=hub && hub.dataset.uid===state.user?.uid && hub.dataset.boardId===state.activeBoardId;
    const focused=document.activeElement;
    const editor=sameContext && hub.contains(focused) &&
      focused.matches('#ha-create-board input[name="title"], #ha-invite-form input[name="email"]') ? focused : null;
    const selection=editor ? [editor.selectionStart,editor.selectionEnd,editor.selectionDirection] : null;
    render();
    if(sameContext && !hub.isConnected && location.hash.slice(1)==='boards'){
      content.prepend(hub);
      if(editor && document.activeElement===document.body){
        editor.focus({preventScroll:true});
        if(selection[0]!==null && selection[1]!==null) editor.setSelectionRange(...selection);
      }
    }
  }

  function renderHub() {
    if (location.hash.slice(1) !== 'boards') {
      content.querySelector(`#${hubId}`)?.remove();
      return;
    }
    let hub = content.querySelector(`#${hubId}`);
    if (!hub) { hub = makeHub(); content.prepend(hub); }

    const user = state.user;
    if (!state.ready) {
      hub.innerHTML = `<div class="cloud-hub-heading"><div><p class="eyebrow">ACCOUNT SYNC</p><h2 id="cloud-hub-title">Private boards</h2></div></div>
        <p>${esc(state.setupMessage || 'Account sync is not configured on this deployment. Your saved references stay on this device.')}</p>
        <button type="button" data-ha="open-account">Account setup</button>`;
      return;
    }
    if (!user || !user.emailVerified) {
      hub.innerHTML = `<div class="cloud-hub-heading"><div><p class="eyebrow">ACCOUNT SYNC</p><h2 id="cloud-hub-title">Private boards</h2></div><span class="cloud-state">${user ? 'VERIFY EMAIL' : 'DEVICE ONLY'}</span></div>
        <p>${user ? 'Verify your email before opening or sharing cloud boards.' : 'Sign in to keep your board private and sync it across devices. Device saves remain separate until you import them.'}</p>
        <button type="button" data-ha="open-account">${user ? 'Account and verification' : 'Sign in or create account'}</button>`;
      return;
    }
    const options = state.refs.map(board => `<option value="${esc(board.boardId)}" ${board.boardId === state.activeBoardId ? 'selected' : ''}>${esc(board.title || 'Untitled board')} · ${board.role === 'owner' ? 'Owner' : 'Shared'}</option>`).join('');
    const active = state.refs.find(board => board.boardId === state.activeBoardId);
    const invitation = state.inviteLink ? `<div class="invite-link"><label>Invite link<input readonly value="${esc(state.inviteLink)}" aria-label="Invitation link"></label><a href="mailto:${encodeURIComponent(state.inviteEmail)}?subject=${encodeURIComponent('Join my Hugging App board')}&body=${encodeURIComponent(`Open this private Hugging App board invitation: ${state.inviteLink}`)}">Open email draft</a></div>` : '';
    const pending = state.pending.map(invite => `<li><span>${esc(invite.inviteeEmail)}</span><button type="button" data-ha="revoke-invite" data-id="${esc(invite.id)}">Revoke</button></li>`).join('');
    const members = state.members.map(member => `<li><span>${esc(member.email)} <small>${member.role === 'owner' ? 'Owner' : 'Member'}</small></span>${active?.role === 'owner' && member.uid !== user.uid ? `<button type="button" data-ha="remove-member" data-id="${esc(member.uid)}">Remove</button>` : member.uid === user.uid && member.role !== 'owner' ? `<button type="button" data-ha="leave-board">Leave</button>` : ''}</li>`).join('');
    const incoming = state.incoming.map(invite => `<li><span>${esc(invite.inviteeEmail)} invited you to <strong>${esc(invite.boardTitle || 'a private board')}</strong></span><button type="button" data-ha="accept-invite" data-id="${esc(invite.id)}">Accept</button></li>`).join('');
    const sameContext=hub.dataset.uid===user.uid && hub.dataset.boardId===state.activeBoardId;
    const focused=document.activeElement;
    const activeEditor=sameContext && hub.contains(focused) &&
      focused.matches('#ha-create-board input[name="title"], #ha-invite-form input[name="email"]') ? focused : null;
    const editorState=activeEditor ? {
      selector:activeEditor.closest('form').id==='ha-create-board' ? '#ha-create-board input[name="title"]' : '#ha-invite-form input[name="email"]',
      start:activeEditor.selectionStart,end:activeEditor.selectionEnd,direction:activeEditor.selectionDirection
    } : null;
    if(!sameContext){state.draftTitle='';state.draftInvite='';}
    hub.innerHTML = `<div class="cloud-hub-heading"><div><p class="eyebrow">PRIVATE SYNC</p><h2 id="cloud-hub-title">Your boards</h2></div><span class="cloud-state">${state.error ? 'NEEDS ATTENTION' : 'SYNCED'}</span></div>
      <p class="cloud-note">Signed in as ${esc(user.email)}. Only you and people you invite can open these boards.</p>
      ${state.notice ? `<p class="cloud-note" role="status" aria-live="polite">${esc(state.notice)}</p>` : ''}
      ${state.error ? `<p class="error" role="alert">${esc(state.error)}</p>` : ''}
      <div class="cloud-board-controls"><label>Active board<select data-ha="board-select">${options}</select></label><form id="ha-create-board"><label>New board<input name="title" maxlength="80" placeholder="e.g. Onboarding references" required></label><button type="submit">Create board</button></form></div>
      ${active?.role === 'owner' ? `<div class="cloud-share"><form id="ha-invite-form"><label>Invite by email<input name="email" type="email" autocomplete="email" placeholder="name@example.com" required></label><button type="submit">Create invite</button></form>${invitation}</div>` : '<p class="cloud-note">You can save references to this shared board. Only its owner can invite or remove members.</p>'}
      ${state.activeBoardId?.startsWith(`personal-${user.uid}`) ? '<button type="button" data-ha="import-device">Merge this browser’s saved references into your personal board</button>' : ''}
      <div class="cloud-lists"><div><h3>People on this board</h3><ul>${members || '<li>Loading members…</li>'}</ul></div>${active?.role === 'owner' ? `<div><h3>Pending invites</h3><ul>${pending || '<li>No pending invites.</li>'}</ul></div>` : ''}</div>
      ${incoming.length ? `<div class="cloud-incoming"><h3>Invitations for ${esc(user.email)}</h3><ul>${incoming}</ul></div>` : ''}`;
    hub.dataset.uid=user.uid;
    hub.dataset.boardId=state.activeBoardId;
    if(editorState) hub.querySelector(editorState.selector)?.replaceWith(activeEditor);
    const titleInput=hub.querySelector('#ha-create-board input[name="title"]');
    const inviteInput=hub.querySelector('#ha-invite-form input[name="email"]');
    if (titleInput) titleInput.value=state.draftTitle;
    if (inviteInput) inviteInput.value=state.draftInvite;
    if(editorState && document.activeElement===document.body){
      const editor=hub.querySelector(editorState.selector);
      if(editor){
        editor.focus({preventScroll:true});
        if(editorState.start!==null && editorState.end!==null)
          editor.setSelectionRange(editorState.start,editorState.end,editorState.direction);
      }
    }
    hub.querySelector('[data-ha="board-select"]')?.addEventListener('change', event => selectBoard(event.target.value));
    hub.querySelector('#ha-create-board')?.addEventListener('submit', createBoard);
    hub.querySelector('#ha-invite-form')?.addEventListener('submit', createInvite);
  }

  function showAuthState(user, generation) {
    if (generation !== undefined && generation !== state.authGeneration) return false;
    state.user = user;
    const hasUser = Boolean(user);
    authActions.hidden = !state.ready || hasUser;
    accountReady.hidden = !state.ready || !hasUser;
    accountButton.textContent = hasUser ? (user.emailVerified ? 'Account · ' + user.email : 'Verify email') : 'Account';
    if (hasUser) {
      document.querySelector('#ha-signed-in-as').textContent = `Signed in as ${user.email || 'your Google account'}.`;
      const unverified = user.providerData.some(entry => entry.providerId === 'password') && !user.emailVerified;
      document.querySelector('[data-ha="verify"]').hidden = !unverified;
      document.querySelector('[data-ha="refresh-user"]').hidden = !unverified;
      setStatus(unverified ? 'Check your inbox and verify your email before using synced boards.' : 'Your account is ready.');
    } else if (state.ready) setStatus('Sign in with Google or email.');
    return true;
  }

  function clearBoardState() {
    cancelListeners();
    state.refs = []; state.activeBoardId = ''; state.itemDocs = []; state.pending = []; state.incoming = []; state.members = []; state.activeTitle = '';
    window.HuggingCatalog?.useDeviceBoard();
    renderHub();
  }

  function authCurrent(generation,uid) { return generation===state.authGeneration&&state.user?.uid===uid; }
  function itemKey(kind, id) { return itemDocumentId(kind, id); }
  function itemReference(boardId, kind, id) { return state.api.doc(state.db, 'boards', boardId, 'items', itemKey(kind, id)); }
  function itemArrays(docs) {
    const screens = [], collections = [];
    for (const item of docs) {
      if (item.kind === 'screen') screens.push(item.itemId);
      if (item.kind === 'collection') collections.push(item.itemId);
    }
    return {screens,collections};
  }

  async function makeBoard(title, id = null) {
    const api = state.api, user = state.user, generation=state.authGeneration;
    const boardRef = id ? api.doc(state.db, 'boards', id) : api.doc(api.collection(state.db, 'boards'));
    const normalizedTitle = title.trim().slice(0, 80);
    const now = api.serverTimestamp();
    const batch = api.writeBatch(state.db);
    batch.set(boardRef, {ownerUid:user.uid,title:normalizedTitle,createdAt:now,updatedAt:now,schemaVersion:1,state:'active'});
    batch.set(api.doc(state.db,'boardIdentities',boardRef.id), {ownerUid:user.uid,state:'active',createdAt:now});
    batch.set(api.doc(boardRef,'members',user.uid), {uid:user.uid,email:normalizeEmail(user.email),role:'owner',joinedAt:now,inviteId:null});
    batch.set(api.doc(state.db,'users',user.uid,'boards',boardRef.id), {boardId:boardRef.id,title:normalizedTitle,role:'owner'});
    await batch.commit();
    if(generation!==state.authGeneration||state.user?.uid!==user.uid) return null;
    return boardRef.id;
  }

  async function ensurePersonalBoard(user=state.user) {
    const generation=state.authGeneration, uid=user.uid;
    const id = `personal-${uid}`;
    const indexRef = state.api.doc(state.db,'users',uid,'boards',id);
    const current=()=>authCurrent(generation,uid);
    const validateExisting = async () => {
      const indexed = await state.api.getDoc(indexRef);
      if (!current()) return false;
      if (!indexed.exists()) return false;
      const index = indexed.data();
      if (index.boardId !== id || index.role !== 'owner') throw new Error('The personal board index is invalid.');
      const boardRef = state.api.doc(state.db,'boards',id);
      const [board,member] = await Promise.all([
        state.api.getDoc(boardRef),state.api.getDoc(state.api.doc(boardRef,'members',uid))
      ]);
      if (!current()) return false;
      if (!board.exists() || board.data().ownerUid !== uid || board.data().state !== 'active' ||
          !member.exists() || member.data().role !== 'owner') throw new Error('The personal board membership is missing or inactive.');
      return true;
    };
    if (await validateExisting()) return id;
    if (!authCurrent(generation,uid)) return null;
    try { return await makeBoard('My saved board', id); }
    catch (createError) {
      if (!authCurrent(generation,uid)) return null;
      try { if (await validateExisting()) return id; }
      catch { throw createError; }
      throw createError;
    }
  }

  function listenBoards(generation=state.authGeneration, uid=state.user.uid) {
    const ref = state.api.collection(state.db,'users',uid,'boards');
    listen(state.api.onSnapshot(ref, snapshot => {
      if (generation!==state.authGeneration || state.user?.uid!==uid) return;
      state.refs = snapshot.docs.map(doc => ({boardId:doc.id,...doc.data()}));
      const saved = localStorage.getItem(`oac-active-board:${uid}`);
      const preferred = state.refs.find(board => board.boardId === saved);
      const personal = `personal-${uid}`;
      const target = preferred || state.refs.find(board => board.boardId === personal) || state.refs[0];
      if (target && target.boardId !== state.activeBoardId) selectBoard(target.boardId);
      renderHub();
    }, error => { if(generation===state.authGeneration&&state.user?.uid===uid){state.error = errorText(error); renderHub();} }));
  }

  function listenInvites(generation=state.authGeneration, user=state.user) {
    const api = state.api;
    const inbox = api.query(api.collection(state.db,'boardInvites'),api.where('inviteeEmail','==',normalizeEmail(user.email)),api.where('status','==','pending'));
    listen(api.onSnapshot(inbox, snapshot => {
      if (generation!==state.authGeneration || state.user?.uid!==user.uid) return;
      state.incoming = snapshot.docs.filter(doc=>doc.data().status==='pending').map(doc=>({id:doc.id,...doc.data()}));
      renderHub();
    }, error => { if(generation===state.authGeneration&&state.user?.uid===user.uid){state.error = errorText(error); renderHub();} }));
  }

  function listenBoardItems(boardId,generation=state.authGeneration,uid=state.user.uid) {
    const api = state.api;
    state.activeBoardId = boardId;
    state.itemDocs = [];
    state.error = '';
    window.HuggingCatalog?.applyRemoteBoard({screens:[],collections:[]});
    const board = state.refs.find(item => item.boardId === boardId);
    state.activeTitle = board?.title || 'Saved board';
    state.members = []; state.pending = [];
    try { localStorage.setItem(`oac-active-board:${uid}`,boardId); } catch {}
    const current=()=>generation===state.authGeneration&&state.user?.uid===uid&&state.activeBoardId===boardId;
    listen(api.onSnapshot(api.collection(state.db,'boards',boardId,'items'),snapshot => {
      if(!current())return;
      state.itemDocs = snapshot.docs.map(doc => doc.data());
      state.error = '';
      renderCatalogBoard(()=>window.HuggingCatalog?.applyRemoteBoard(itemArrays(state.itemDocs)));
      renderHub();
    },error => { if(current()){state.error=errorText(error);renderCatalogBoard(()=>window.HuggingCatalog?.useDeviceBoard());renderHub();} }));
    listen(api.onSnapshot(api.collection(state.db,'boards',boardId,'members'),snapshot => {
      if(current()){state.members = snapshot.docs.map(doc=>doc.data()); renderHub();}
    },error=>{if(current()){state.error=errorText(error);renderHub();}}));
    if (board?.role === 'owner') {
      const pending = api.query(api.collection(state.db,'boardInvites'),api.where('boardId','==',boardId),api.where('ownerUid','==',uid));
      listen(api.onSnapshot(pending,snapshot=>{if(current()){state.pending=snapshot.docs.filter(doc=>doc.data().status==='pending').map(doc=>({id:doc.id,...doc.data()}));renderHub();}},error=>{if(current()){state.error=errorText(error);renderHub();}}));
    }
    renderHub();
  }

  function selectBoard(boardId) {
    if (!state.refs.some(board => board.boardId === boardId) || boardId === state.activeBoardId) return;
    state.inviteLink=''; state.inviteEmail='';
    state.draftTitle=''; state.draftInvite='';
    const generation=state.authGeneration, uid=state.user?.uid;
    cancelListeners();
    listenBoardItems(boardId,generation,uid);
    listenBoards(generation,uid);
    listenInvites(generation,state.user);
  }

  async function handleAuth(user) {
    const previousUid=state.user?.uid, generation=++state.authGeneration;
    if(previousUid!==user?.uid){state.draftTitle='';state.draftInvite='';state.inviteLink='';state.inviteEmail='';state.notice='';state.error='';}
    if (!showAuthState(user,generation)) return;
    if(previousUid!==user?.uid) clearBoardState();
    if (!user || !user.emailVerified) { clearBoardState(); renderHub(); return; }
    cancelListeners(); state.refs=[]; state.error=''; state.incoming=[];
    window.HuggingCatalog?.applyRemoteBoard({screens:[],collections:[]});
    try {
      await ensurePersonalBoard();
      if (generation!==state.authGeneration || state.user?.uid!==user.uid) return;
      state.activeBoardId = '';
      listenBoards(generation,user.uid); listenInvites(generation,user);
      const deepLinkInvite = new URL(location.href).searchParams.get('invite');
      if (deepLinkInvite) await showDeepLinkInvite(deepLinkInvite,generation,user);
    } catch (error) {
      if (generation!==state.authGeneration || state.user?.uid!==user.uid) return;
      state.error = errorText(error); renderHub();
    }
  }

  async function createBoard(event) {
    event.preventDefault();
    const generation=state.authGeneration, user=state.user, form=event.currentTarget;
    const title = new FormData(form).get('title');
    const draftTitleRevision=state.draftTitleRevision;
    try {
      const id = await makeBoard(title);
      if(!id||!authCurrent(generation,user.uid)) return;
      if(state.draftTitleRevision===draftTitleRevision){
        state.draftTitle='';
        const currentTitle=content.querySelector(`#${hubId} #ha-create-board input[name="title"]`);
        if (currentTitle) currentTitle.value='';
      }
      state.refs.push({boardId:id,title:String(title).trim(),role:'owner'});
      selectBoard(id); setStatus('Private board created.');
    } catch (error) { if(authCurrent(generation,user.uid)){state.error=errorText(error);renderHub();} }
  }

  async function createInvite(event) {
    event.preventDefault();
    const generation=state.authGeneration, user=state.user, form=event.currentTarget;
    const email = normalizeEmail(new FormData(form).get('email'));
    const board = state.refs.find(item=>item.boardId===state.activeBoardId);
    if (!email || !board || board.role!=='owner' || email===normalizeEmail(user.email)) return;
    if (state.members.some(member=>normalizeEmail(member.email)===email) || state.pending.some(invite=>normalizeEmail(invite.inviteeEmail)===email)) {
      state.error='That email already belongs to this board or has a pending invite.';
      renderHub();
      return;
    }
    try {
      const ref = state.api.doc(state.api.collection(state.db,'boardInvites'));
      await state.api.setDoc(ref,{boardId:board.boardId,boardTitle:board.title,ownerUid:user.uid,inviteeEmail:email,status:'pending',createdAt:state.api.serverTimestamp(),acceptedByUid:null});
      if(!authCurrent(generation,user.uid)||state.activeBoardId!==board.boardId)return;
      state.inviteLink = `${location.origin}${location.pathname}?invite=${encodeURIComponent(ref.id)}#boards`;
      state.inviteEmail = email;
      state.draftInvite='';
      const currentEmail=content.querySelector(`#${hubId} #ha-invite-form input[name="email"]`);
      if (currentEmail) currentEmail.value='';
      const inviteLink=state.inviteLink;
      try { await navigator.clipboard.writeText(inviteLink); } catch {}
      if(!authCurrent(generation,user.uid)||state.activeBoardId!==board.boardId)return;
      renderHub();
    } catch (error) { if(authCurrent(generation,user.uid)&&state.activeBoardId===board.boardId){state.error=errorText(error);renderHub();} }
  }

  async function showDeepLinkInvite(id,generation=state.authGeneration,user=state.user) {
    if (!/^[A-Za-z0-9_-]{10,40}$/.test(id)) { if(authCurrent(generation,user.uid)){state.error='This invitation link is not valid.';renderHub();} return; }
    try {
      const snapshot=await state.api.getDoc(state.api.doc(state.db,'boardInvites',id));
      if(!authCurrent(generation,user.uid))return;
      if (!snapshot.exists() || snapshot.data().status!=='pending') { state.error='This invitation is no longer pending.'; renderHub(); return; }
      const invite={id,...snapshot.data()};
      if (normalizeEmail(invite.inviteeEmail)!==normalizeEmail(user.email)) { state.error='Sign in with the email address this board owner invited.'; renderHub(); return; }
      if (!state.incoming.some(item=>item.id===id)) state.incoming=[...state.incoming,invite];
      renderHub();
    } catch (error) { if(authCurrent(generation,user.uid)){state.error=errorText(error);renderHub();} }
  }

  async function acceptInvite(id) {
    const generation=state.authGeneration, user=state.user, invite=state.incoming.find(item=>item.id===id);
    if (!invite || normalizeEmail(invite.inviteeEmail)!==normalizeEmail(user.email)) return;
    try {
      const api=state.api, batch=api.writeBatch(state.db), now=api.serverTimestamp();
      batch.update(api.doc(state.db,'boardInvites',id),{status:'accepted',acceptedByUid:user.uid});
      batch.set(api.doc(state.db,'boards',invite.boardId,'members',user.uid),{uid:user.uid,email:normalizeEmail(user.email),role:'member',joinedAt:now,inviteId:id});
      batch.set(api.doc(state.db,'users',user.uid,'boards',invite.boardId),{boardId:invite.boardId,title:invite.boardTitle||'Shared board',role:'member'});
      await batch.commit();
      if(!authCurrent(generation,user.uid))return;
      try {
        const board=await api.getDoc(api.doc(state.db,'boards',invite.boardId));
        if(!authCurrent(generation,user.uid))return;
        if (board.exists() && board.data().title!==invite.boardTitle)
          await api.updateDoc(api.doc(state.db,'users',user.uid,'boards',invite.boardId),{title:board.data().title});
      } catch {
        if(!authCurrent(generation,user.uid))return;
        state.notice='You joined the board. Its latest title will sync when available.';
      }
      if(!authCurrent(generation,user.uid))return;
      history.replaceState(null,'',`${location.pathname}#boards`);
      state.error='';
    } catch (error) { if(authCurrent(generation,user.uid)){state.error=errorText(error);renderHub();} }
  }

  async function revokeInvite(id) {
    const generation=state.authGeneration, user=state.user, boardId=state.activeBoardId;
    try { await state.api.updateDoc(state.api.doc(state.db,'boardInvites',id),{status:'revoked',acceptedByUid:null}); }
    catch(error){if(authCurrent(generation,user.uid)&&state.activeBoardId===boardId){state.error=errorText(error);renderHub();}}
  }

  async function removeMember(uid) {
    const generation=state.authGeneration, user=state.user, board=state.refs.find(item=>item.boardId===state.activeBoardId);
    if (!board || board.role!=='owner' || uid===user.uid) return;
    try {
      const batch=state.api.writeBatch(state.db);
      batch.delete(state.api.doc(state.db,'boards',board.boardId,'members',uid));
      batch.delete(state.api.doc(state.db,'users',uid,'boards',board.boardId));
      await batch.commit();
    } catch(error){if(authCurrent(generation,user.uid)&&state.activeBoardId===board.boardId){state.error=errorText(error);renderHub();}}
  }

  async function leaveBoard() {
    const generation=state.authGeneration, user=state.user, board=state.refs.find(item=>item.boardId===state.activeBoardId);
    if (!board || board.role==='owner') return;
    try {
      const batch=state.api.writeBatch(state.db);
      batch.delete(state.api.doc(state.db,'boards',board.boardId,'members',user.uid));
      batch.delete(state.api.doc(state.db,'users',user.uid,'boards',board.boardId));
      await batch.commit();
    } catch(error){if(authCurrent(generation,user.uid)&&state.activeBoardId===board.boardId){state.error=errorText(error);renderHub();}}
  }

  async function importDeviceBoard() {
    const generation=state.authGeneration, user=state.user, personalId=`personal-${user.uid}`;
    if (state.activeBoardId!==personalId) return;
    const device=window.HuggingCatalog?.getDeviceBoard() || {screens:[],collections:[]};
    const existing=await state.api.getDocs(state.api.collection(state.db,'boards',personalId,'items'));
    if(!authCurrent(generation,user.uid)||state.activeBoardId!==personalId)return;
    const keys=new Set(existing.docs.map(doc=>doc.id));
    const wanted=[...device.screens.map(id=>({kind:'screen',id})),...device.collections.map(id=>({kind:'collection',id}))]
      .filter(item=>typeof item.id==='string' && item.id.length>0 && item.id.length<=180)
      .filter(item=>!keys.has(itemKey(item.kind,item.id)));
    for(let index=0;index<wanted.length;index+=400){
      const batch=state.api.writeBatch(state.db);
      for(const item of wanted.slice(index,index+400)) batch.set(itemReference(personalId,item.kind,item.id),{kind:item.kind,itemId:item.id,addedBy:user.uid,addedAt:state.api.serverTimestamp()});
      await batch.commit();
      if(!authCurrent(generation,user.uid)||state.activeBoardId!==personalId)return;
    }
    state.error='';
    state.notice=wanted.length ? `Merged ${wanted.length} browser save${wanted.length===1?'':'s'} into your private board.` : 'Your private board already includes these browser saves.';
    renderHub();
  }

  async function initialize() {
    let config;
    try {
      const response=await fetch('/firebase-config.json',{cache:'no-store'});
      if (!response.ok) throw new Error(`Configuration returned ${response.status}.`);
      config=await response.json();
      const emulators = localEmulatorConfig(config);
      if (!firebaseConfigReady(config, Boolean(emulators))) throw new Error('The Firebase Web App configuration must target the approved Hugging App project.');
    } catch {
      state.setupMessage='Account sync is not configured on this deployment. The Firebase Web App must be activated and its public app configuration added before sign-in is available.';
      state.ready=false; showAuthState(null); setStatus(state.setupMessage); renderHub(); return;
    }
    try {
      const [appSdk,authSdk,dbSdk]=await Promise.all([
        import(`${SDK}/firebase-app.js`),import(`${SDK}/firebase-auth.js`),import(`${SDK}/firebase-firestore.js`)
      ]);
      const app=appSdk.initializeApp(config);
      state.auth=authSdk.getAuth(app); state.db=dbSdk.getFirestore(app);
      const emulators=localEmulatorConfig(config);
      if (emulators) {
        authSdk.connectAuthEmulator(state.auth,`http://127.0.0.1:${emulators.authPort}`,{disableWarnings:true});
        dbSdk.connectFirestoreEmulator(state.db,'127.0.0.1',emulators.firestorePort);
      }
      state.api={...authSdk,...dbSdk}; state.ready=true; showAuthState(state.auth.currentUser);
      try { await authSdk.getRedirectResult(state.auth); } catch(error){setStatus(errorText(error),true);}
      authSdk.onAuthStateChanged(state.auth,user=>{ void handleAuth(user); });
      renderHub();
    } catch(error){state.setupMessage=errorText(error);state.ready=false;showAuthState(null);setStatus(state.setupMessage,true);renderHub();}
  }

  async function authAction(action) {
    const api=state.api, email=normalizeEmail(document.querySelector('#ha-email').value), password=document.querySelector('#ha-password').value;
    try {
      if (action==='google') {
        setStatus('Opening Google sign-in…');
        await api.signInWithRedirect(state.auth,new api.GoogleAuthProvider());
      } else if (action==='signin') {
        await api.signInWithEmailAndPassword(state.auth,email,password);
        setStatus('Signed in.');
      } else if (action==='create') {
        const credential=await api.createUserWithEmailAndPassword(state.auth,email,password);
        await api.sendEmailVerification(credential.user,{url:location.href});
        setStatus('Account created. Check your inbox to verify your email.');
      } else if (action==='reset') {
        if (!email) throw new Error('Enter your email address first.');
        await api.sendPasswordResetEmail(state.auth,email,{url:location.href});
        setStatus('If an account uses that email, a password reset link is on its way.');
      } else if (action==='verify') {
        if (state.auth.currentUser) { await api.sendEmailVerification(state.auth.currentUser); setStatus('Verification email sent.'); }
      } else if (action==='refresh-user') {
        if (state.auth.currentUser) {
          await api.reload(state.auth.currentUser);
          await api.getIdToken(state.auth.currentUser,true);
          await handleAuth(state.auth.currentUser);
          if (state.auth.currentUser.emailVerified) dialog.close();
        }
      } else if (action==='signout') {
        await api.signOut(state.auth); dialog.close();
      }
    } catch(error){setStatus(error.message==='Enter your email address first.'?error.message:errorText(error),true);}
  }

  accountButton.addEventListener('click',signIn);
  content.addEventListener('input',event=>{
    if (event.target.matches('#ha-create-board input[name="title"]')) {
      state.draftTitle=event.target.value;
      state.draftTitleRevision++;
    }
    if (event.target.matches('#ha-invite-form input[name="email"]')) state.draftInvite=event.target.value;
  });
  dialog.addEventListener('click',event=>{
    const button=event.target.closest('[data-ha]'); if(!button)return;
    const action=button.dataset.ha;
    if(action==='close'){dialog.close();return;}
    if(action==='google'||action==='verify'||action==='refresh-user'||action==='signout') { void authAction(action);return; }
    if(action==='create'||action==='reset') { void authAction(action); }
  });
  dialog.querySelector('#ha-email-form').addEventListener('submit',event=>{event.preventDefault();void authAction('signin');});
  dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
  window.addEventListener('hugging:board-change',event=>{
    const {kind,id,saved}=event.detail||{};
    if(!state.ready||!state.user?.emailVerified||!state.activeBoardId||!['screen','collection'].includes(kind)||typeof id!=='string')return;
    const generation=state.authGeneration, uid=state.user.uid, boardId=state.activeBoardId;
    const ref=itemReference(boardId,kind,id);
    const operation=saved
      ? state.api.setDoc(ref,{kind,itemId:id,addedBy:uid,addedAt:state.api.serverTimestamp()})
      : state.api.deleteDoc(ref);
    operation.catch(error=>{if(generation!==state.authGeneration||state.user?.uid!==uid||state.activeBoardId!==boardId)return;state.error=errorText(error);renderCatalogBoard(()=>window.HuggingCatalog?.applyRemoteBoard(itemArrays(state.itemDocs)));renderHub();});
  });

  const hubActions=event=>{
    const button=event.target.closest('[data-ha]'); if(!button)return;
    if(!content.querySelector(`#${hubId}`)?.contains(button))return;
    const {ha:action,id}=button.dataset;
    if(action==='open-account'){signIn();return;}
    if(action==='accept-invite'){void acceptInvite(id);return;}
    if(action==='revoke-invite'){void revokeInvite(id);return;}
    if(action==='remove-member'){void removeMember(id);return;}
    if(action==='leave-board'){void leaveBoard();return;}
    if(action==='import-device'){
      const generation=state.authGeneration, user=state.user, boardId=state.activeBoardId;
      void importDeviceBoard().catch(error=>{
        if(authCurrent(generation,user.uid)&&state.activeBoardId===boardId){state.error=errorText(error);renderHub();}
      });
    }
  };
  content.addEventListener('click',hubActions);
  state.mutationObserver=new MutationObserver(renderHub);
  state.mutationObserver.observe(content,{childList:true});
  window.addEventListener('hashchange',renderHub);
  renderHub();
  void initialize();
}

if (typeof document !== 'undefined') start();
