/* Help and support: searchable FAQ and message to the admin. */
(async function () {
  const ctx = await Shell.init();
  const profile = ctx.profile;
  const { $, esc, icon, setBusy } = UI;
  const root = $('#page');

  const FAQ = [
    ['How do I add an entry?', 'Open Log Sheet and click Add entry. Fill in the client details, choose the member category, then click Save entry. Use Save and add another to enter several clients in a row.'],
    ['Where are my entries saved?', 'On this laptop only, in the C:\\Temp\\PCares folder. Nothing patient-related is sent to the internet.'],
    ['How do I back up my data?', 'Go to Profile, then Your data, then click Back up now. A backup is also made automatically once a day.'],
    ['How do I restore a backup?', 'Go to Profile, then Your data, then click Restore backup and choose a backup from the list.'],
    ['I see a message that the app lost access to the data folder.', 'Refresh the page (Ctrl+F5), then click Allow access when asked. Use Google Chrome or Microsoft Edge on a laptop or desktop.'],
    ['How do I export the PDF?', 'Open Log Sheet, set the Hospital and the From and To dates, then click Export PDF. Fill in the control number and OPD details, then click Download PDF.'],
    ['Why is Membership status greyed out?', 'Non-Member clients do not have a membership status, so the field is turned off when Non-Member is selected.'],
    ['How do I add a signature?', 'Sign inside the box using mouse, finger or stylus. You can also copy a signature picture, click the box, and press Ctrl+V.'],
    ['I entered a client by mistake.', 'On the Log Sheet, click the pencil icon to edit the entry or the trash icon to delete it.'],
    ['How do I change my hospital?', 'Go to Profile and click Switch hospital.'],
    ['I forgot my password.', 'On the sign-in page, click Forgot password and enter your email. You can also change it in Profile, in the Change password box, if you still know your current one.'],
    ['I want to change my username, email or position.', 'Click Edit details in Profile for your name, position and contact number. Username and email can only be changed by the admin, so send a message here.'],
    ['I cannot see my old entries on another laptop.', 'Entries are saved per laptop. Make a backup on the old laptop and restore it on the new one.']
  ];

  root.innerHTML = `
    <div class="grid grid-main">
      <section class="card card-pad" style="align-self:start">
        <h3 style="margin-bottom:.2rem">Frequently asked questions</h3>
        <p class="muted small">Search here first. If you cannot find an answer, send a message to the admin.</p>
        <div class="search-box">${icon('search', 18)}<input class="input" id="faqSearch" type="search" placeholder="Search frequently asked questions" aria-label="Search FAQ"></div>
        <div class="faq-list" id="faqList"></div>
      </section>
      <section class="card card-pad" style="align-self:start">
        <h3 style="margin-bottom:.2rem">Message the admin</h3>
        <p class="muted small">Tell the admin what needs to be adjusted or fixed. Do not include patient details.</p>
        <div class="field"><label class="label" for="mgSub">Subject</label><input class="input" id="mgSub" maxlength="100" placeholder="e.g. Please change my username"></div>
        <div class="field"><label class="label" for="mgBody">Message</label><textarea class="input" id="mgBody" rows="5" maxlength="1000"></textarea></div>
        <div class="row">
          <button class="btn btn-primary" id="mgSend">${icon('mail', 18)}<span>Send message</span></button>
          <button class="btn btn-ghost" id="mgList">${icon('list', 18)}<span>Messages</span></button>
        </div>
      </section>
    </div>`;

  const list = $('#faqList');
  function drawFaq(q) {
    const t = (q || '').trim().toLowerCase();
    const rows = FAQ.filter(([a, b]) => !t || (a + ' ' + b).toLowerCase().includes(t));
    list.innerHTML = rows.length
      ? rows.map(([a, b]) => `<details class="faq-item"><summary>${esc(a)}</summary><p>${esc(b)}</p></details>`).join('')
      : '<div class="empty-mini"><p>No answer found. Send a message to the admin.</p></div>';
  }
  drawFaq('');
  $('#faqSearch').addEventListener('input', UI.debounce((e) => drawFaq(e.target.value), 150));

  $('#mgSend').addEventListener('click', async (e) => {
    const sub = $('#mgSub').value.trim(), body = $('#mgBody').value.trim();
    if (!sub) { UI.flagInput($('#mgSub')); UI.toast('Enter a subject.', 'error'); return; }
    if (!body) { UI.flagInput($('#mgBody')); UI.toast('Enter your message.', 'error'); return; }
    const btn = e.currentTarget; setBusy(btn, true, 'Sending');
    try {
      await API.support.send(profile.id, sub, body);
      $('#mgSub').value = ''; $('#mgBody').value = '';
      UI.toast('Message sent to the admin.', 'success');
    } catch (err) { UI.toast(err.message, 'error', 5000); }
    finally { setBusy(btn, false); }
  });

  $('#mgList').addEventListener('click', async (e) => {
    const btn = e.currentTarget; setBusy(btn, true, 'Loading');
    let rows = [];
    try { rows = await API.support.mine(profile.id); }
    catch (err) { UI.toast(err.message, 'error', 5000); setBusy(btn, false); return; }
    setBusy(btn, false);
    UI.modal({
      title: 'Messages', headIcon: 'mail', size: 'sm',
      body: rows.length ? rows.map(m => `<div class="msg-item">
          <div class="row"><strong>${esc(m.subject)}</strong><span class="spacer"></span>${m.status === 'open' ? '<span class="badge badge-amber">Open</span>' : '<span class="badge badge-green">Done</span>'}</div>
          <p class="muted small" style="white-space:pre-wrap;margin:.25rem 0">${esc(m.message)}</p>
          ${m.admin_reply ? `<div class="msg-reply"><strong>Admin reply:</strong> <span style="white-space:pre-wrap">${esc(m.admin_reply)}</span></div>` : ''}
          <small class="muted">${esc(UI.timeAgo(m.created_at))}</small></div>`).join('')
        : `<div class="empty-mini">${icon('mail', 22)}<p>You have not sent any messages yet.</p></div>`,
      footer: [{ label: 'Close', className: 'btn-primary' }]
    });
  });
})();