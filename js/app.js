/**
 * ============================================================================
 * js/app.js - Frontend Logic (GitHub Pages / Headless GAS Edition)
 * ระบบจองห้องประชุมออนไลน์ เทศบาลเมืองสมุทรสงคราม
 * [ช่วงที่ 1 / 2]
 * ============================================================================
 */

// [สำคัญ] 1. นำ Web App URL (/exec) จาก Google Apps Script มาวางที่นี่
var GAS_API_URL = "https://script.google.com/macros/s/AKfycbwqiWZF_yBsUa18YW4pVvFslXh1lq6A3n9S8wOJptwSQPKx_JH0eXS2tokk8XlmsdKMfw/exec";

// [ทางเลือก] 2. ใส่ Google OAuth Client ID (จาก Google Cloud Console)
var GOOGLE_CLIENT_ID = "146666427453-ml6lhhnemb9l3ok4urr5oia8lr883e7j.apps.googleusercontent.com";

var STATE = {
  token: sessionStorage.getItem('MRB_AUTH_TOKEN') || '',
  user: { authenticated: false, role: 'Guest', email: '', name: '', department: '', phone: '', googleLinked: false },
  settings: {},
  departments: [],
  rooms: [],
  layouts: [],
  webAppUrl: '',
  calendarInstance: null,
  charts: {},
  pendingRoomImage: null,
  currentPreviewLayout: null,
  pollTimer: null,
  lastBadgeBookings: null,
  lastBadgeUsers: null
};

var DEFAULT_LAYOUTS = [
  { id: "theater", name: "แบบเธียเตอร์ (Theater)", desc: "จัดเก้าอี้แถวเรียง ไม่ใช้โต๊ะเขียน เหมาะกับการฟังบรรยาย สัมมนา", diagramUrl: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=600&q=80", photoUrl: "https://images.unsplash.com/photo-1517502884422-41eaead166d4?auto=format&fit=crop&w=800&q=80" },
  { id: "classroom", name: "แบบชั้นเรียน (Classroom)", desc: "จัดโต๊ะและเก้าอี้แถวเรียง มีพื้นที่วางเอกสาร เหมาะสำหรับการฝึกอบรม", diagramUrl: "https://images.unsplash.com/photo-1580582932707-520aed937b7b?auto=format&fit=crop&w=600&q=80", photoUrl: "https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=800&q=80" },
  { id: "ushape", name: "แบบตัวยู (U-Shape)", desc: "จัดโต๊ะรูปตัว U ผู้เข้าร่วมสบตากันได้ทั่วถึง เหมาะกับการประชุมหารือ", diagramUrl: "https://images.unsplash.com/photo-1577412647305-991150c7d163?auto=format&fit=crop&w=600&q=80", photoUrl: "https://images.unsplash.com/photo-1505373877841-8d25f7d46678?auto=format&fit=crop&w=800&q=80" },
  { id: "boardroom", name: "แบบโต๊ะประชุมกลาง (Boardroom)", desc: "โต๊ะประชุมตัวใหญ่ล้อมรอบ เหมาะกับการประชุมคณะผู้บริหาร", diagramUrl: "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=600&q=80", photoUrl: "https://images.unsplash.com/photo-1517502884422-41eaead166d4?auto=format&fit=crop&w=800&q=80" },
  { id: "banquet", name: "แบบกลุ่มเวิร์กช็อป (Round Table)", desc: "จัดแบบโต๊ะกลม หรือกลุ่มย่อย เหมาะกับการระดมสมอง", diagramUrl: "https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&w=600&q=80", photoUrl: "https://images.unsplash.com/photo-1528605248644-14dd04022da1?auto=format&fit=crop&w=800&q=80" }
];

/* ==========================================================================
 * Fetch API Bridge
 * ======================================================================== */
function callGas(fnName) {
  if (!GAS_API_URL || GAS_API_URL.indexOf('http') !== 0) {
    return Promise.reject(new Error('กรุณากำหนดค่า GAS_API_URL ในไฟล์ js/app.js ก่อนใช้งาน'));
  }

  var args = Array.prototype.slice.call(arguments, 1);
  var reqToken = STATE.token || '';
  var reqPayload = {};

  if (fnName === 'loginWithCredentials') {
    reqPayload = { email: args[0], passcode: args[1] };
  } else if (fnName === 'loginWithGoogle') {
    reqToken = '';
    reqPayload = { idToken: (args[0] && args[0].idToken ? args[0].idToken : args[0]) };
  } else if (fnName === 'toggleGoogleBinding') {
    reqToken = args[0] || STATE.token;
    reqPayload = {
      idToken: (args[1] && args[1].idToken ? args[1].idToken : (args[1] || '')),
      actionType: (args[1] && args[1].actionType ? args[1].actionType : 'link')
    };
  } else if (fnName === 'registerStaffAccount' || fnName === 'checkRoomAvailability') {
    reqPayload = args[0] || {};
  } else if (fnName === 'getRoomAvailabilityForDate') {
    reqPayload = { date: args[0] };
  } else if (fnName === 'getBookingById') {
    reqPayload = { bookingId: args[0] };
  } else if (fnName === 'getCalendarBookings') {
    reqPayload = { roomId: args[0] || '' };
  } else if (fnName === 'getRooms') {
    reqPayload = { includeInactive: Boolean(args[0]) };
  } else if (['createBooking', 'searchBookings', 'saveRoom', 'saveUser', 'saveAdminSettings', 'updateUserProfile'].indexOf(fnName) !== -1) {
    reqToken = args[0] || STATE.token;
    reqPayload = args[1] || {};
  } else if (fnName === 'cancelBooking') {
    reqToken = args[0] || STATE.token;
    reqPayload = typeof args[1] === 'object' ? args[1] : { bookingId: args[1], cancelReason: args[2] || '' };
  } else if (fnName === 'generateBookingPdf') {
    reqToken = args[0] || STATE.token;
    reqPayload = { bookingId: args[1] };
  } else if (fnName === 'updateBookingStatus') {
    reqToken = args[0] || STATE.token;
    reqPayload = { bookingId: args[1], newStatus: args[2], remark: args[3] || '' };
  } else if (fnName === 'deleteRoom') {
    reqToken = args[0] || STATE.token;
    reqPayload = { roomId: args[1] };
  } else if (fnName === 'deleteUser') {
    reqToken = args[0] || STATE.token;
    reqPayload = { email: args[1] };
  } else if (fnName === 'updateUserStatus') {
    reqToken = args[0] || STATE.token;
    reqPayload = { email: args[1], newStatus: args[2], reason: args[3] || '' };
  } else if (fnName === 'getAuditLogs') {
    reqToken = args[0] || STATE.token;
    reqPayload = { limit: args[1] || 100 };
  } else {
    reqToken = args[0] || STATE.token;
    reqPayload = {};
  }

  return fetch(GAS_API_URL, {
    method: 'POST',
    mode: 'cors',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: fnName, token: reqToken, payload: reqPayload })
  })
  .then(function(response) {
    if (!response.ok) throw new Error('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ (HTTP ' + response.status + ')');
    return response.json();
  })
  .then(function(res) {
    if (res && res.success === false && res.code !== 'CONFLICT') {
      var err = new Error(res.message || 'เกิดข้อผิดพลาดในการดำเนินการ');
      err.code = res.code || 'ERROR';
      throw err;
    }
    return res;
  });
}

/* ==========================================================================
 * Utilities & Thai Modern Calendar
 * ======================================================================== */
function initModernThaiCalendar(elementId, onSelectCallback) {
  var el = document.getElementById(elementId);
  if (!el || typeof flatpickr === 'undefined') return;

  flatpickr(el, {
    locale: 'th',
    dateFormat: 'Y-m-d',
    altInput: true,
    altFormat: 'j M Y',
    minDate: 'today',
    disableMobile: "true",
    onChange: function(selectedDates, dateStr, instance) {
      if (instance.altInput) {
        var val = instance.altInput.value;
        var parts = val.split(' ');
        if (parts.length === 3) {
          var y = parseInt(parts[2], 10);
          if (y && y < 2400) {
            parts[2] = y + 543;
            instance.altInput.value = parts.join(' ');
          }
        }
      }
      if (typeof onSelectCallback === 'function') onSelectCallback(dateStr);
    },
    onReady: function(selectedDates, dateStr, instance) {
      if (instance.altInput) {
        var val = instance.altInput.value;
        var parts = val.split(' ');
        if (parts.length === 3) {
          var y = parseInt(parts[2], 10);
          if (y && y < 2400) {
            parts[2] = y + 543;
            instance.altInput.value = parts.join(' ');
          }
        }
      }
    }
  });
}

function showToast(msg, type) {
  type = type || 'info';
  var iconMap = { 'success': 'success', 'error': 'error', 'warning': 'warning', 'info': 'info' };
  if (typeof Swal !== 'undefined') {
    var Toast = Swal.mixin({
      toast: true, position: 'top-end', showConfirmButton: false, timer: 3500, timerProgressBar: true,
      didOpen: function(toast) { toast.onmouseenter = Swal.stopTimer; toast.onmouseleave = Swal.resumeTimer; }
    });
    Toast.fire({ icon: iconMap[type] || 'info', title: msg });
  }
}

function setLoading(show, text) {
  var el = document.getElementById('loadingOverlay');
  var txt = document.getElementById('loadingText');
  if (txt) txt.textContent = text || 'กำลังประมวลผล...';
  if (el) el.classList.toggle('show', Boolean(show));
}

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function openModal(id) { var el = document.getElementById(id); if (el) el.classList.add('show'); }
function closeModal(id) { var el = document.getElementById(id); if (el) el.classList.remove('show'); }
function toggleSidebar(open) {
  var sb = document.getElementById('sidebar');
  var ov = document.getElementById('sidebarOverlay');
  if (sb) sb.classList.toggle('open', Boolean(open));
  if (ov) ov.classList.toggle('show', Boolean(open));
}

function statusBadge(status) {
  var map = { 'รออนุมัติ': 'badge-pending', 'อนุมัติ': 'badge-approved', 'ไม่อนุมัติ': 'badge-rejected', 'ยกเลิก': 'badge-cancelled', 'เสร็จสิ้น': 'badge-completed' };
  return '<span class="badge ' + (map[status] || 'badge-cancelled') + '">' + escapeHtml(status) + '</span>';
}

function todayIso() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }

function formatDisplayDateThai(dateStr) {
  if (!dateStr) return '-';
  var clean = String(dateStr).substring(0, 10);
  var p = clean.split('-');
  if (p.length !== 3) return clean;
  var months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  return parseInt(p[2], 10) + ' ' + (months[parseInt(p[1], 10) - 1] || '') + ' ' + (parseInt(p[0], 10) + 543);
}

function timeToMinutes(hhmm) { var p = String(hhmm).split(':'); return (p.length < 2) ? -1 : (parseInt(p[0], 10) * 60 + parseInt(p[1], 10)); }
function minutesToTime(mins) { return ('0' + Math.floor(mins / 60)).slice(-2) + ':' + ('0' + (mins % 60)).slice(-2); }
function extractCleanTime(val, defaultTime) {
  var m = String(val || '').match(/(\d{1,2}):(\d{2})/);
  return m ? (('0' + parseInt(m[1], 10)).slice(-2) + ':' + ('0' + parseInt(m[2], 10)).slice(-2)) : (defaultTime || '07:00');
}
function ensureTimeOptionExists(selectEl, timeVal) {
  if (!selectEl || !timeVal) return;
  for (var i = 0; i < selectEl.options.length; i++) { if (selectEl.options[i].value === timeVal) return; }
  var opt = document.createElement('option'); opt.value = timeVal; opt.textContent = timeVal + ' น.'; selectEl.appendChild(opt);
}

/* ==========================================================================
 * Bootstrap & App Initialization
 * ======================================================================== */
document.addEventListener('DOMContentLoaded', function() {
  var urlParams = new URLSearchParams(window.location.search);
  window.APP_BOOT = { initialPage: urlParams.get('page') || 'dashboard', initialBookingId: urlParams.get('bookingId') || '' };
  STATE.token = sessionStorage.getItem('MRB_AUTH_TOKEN') || '';
  localStorage.removeItem('MRB_AUTH_TOKEN');

  bootstrapApp().then(function() {
    if (window.APP_BOOT.initialBookingId) openBookingDetailModal(window.APP_BOOT.initialBookingId);
  });
});

function bootstrapApp() {
  setLoading(true, 'กำลังเชื่อมต่อข้อมูลระบบ...');
  return callGas('getInitialAppData', STATE.token)
    .then(function(res) {
      var data = res.data;
      STATE.user = data.user;
      STATE.settings = data.settings;
      STATE.departments = data.departments || [];
      STATE.rooms = data.rooms || [];
      STATE.layouts = (data.layouts && data.layouts.length > 0) ? data.layouts : DEFAULT_LAYOUTS;
      STATE.webAppUrl = data.webAppUrl || '';

      var orgLabel = document.getElementById('orgNameLabel');
      if (orgLabel) orgLabel.textContent = STATE.settings.ORG_NAME || 'เทศบาลเมืองสมุทรสงคราม';

      populateDropdowns();
      renderBookingLayoutCards();
      updateAuthUI();

      var today = todayIso();
      ['availCheckDate', 'bkDate', 'searchDate'].forEach(function(id) {
        var input = document.getElementById(id);
        if (input && !input.value) {
          input.value = (id === 'searchDate' ? '' : today);
          if (id !== 'searchDate') input.min = today;
        }
      });

      if (typeof initModernThaiCalendar === 'function') {
        initModernThaiCalendar('availCheckDate', function(selectedDate) { handleDateSelectionChange(selectedDate, 'availCheckDate'); });
        initModernThaiCalendar('bkDate', function(selectedDate) { syncDateFromForm(); });
        initModernThaiCalendar('searchDate', function(selectedDate) { runBookingSearch(); });
      }

      updateTimeSlotOptions();
      startNotificationPolling();
      if (typeof initGoogleIdentityServices === 'function') setTimeout(initGoogleIdentityServices, 300);

      var targetView = (window.APP_BOOT && window.APP_BOOT.initialPage && document.getElementById('view-' + window.APP_BOOT.initialPage)) ? window.APP_BOOT.initialPage : 'dashboard';
      navigateTo(targetView);
    })
    .catch(function(err) {
      Swal.fire({ icon: 'error', title: 'เชื่อมต่อระบบไม่สำเร็จ', text: err.message, confirmButtonColor: '#0f4c81' });
    })
    .finally(function() { setLoading(false); });
}

function populateDropdowns() {
  var deptHtml = '<option value="">-- เลือกหน่วยงาน (กอง/สำนัก) --</option>';
  STATE.departments.forEach(function(d) { deptHtml += '<option value="' + escapeHtml(d) + '">' + escapeHtml(d) + '</option>'; });
  ['bkDept', 'regDept', 'usrDept', 'profDept'].forEach(function(id) { var el = document.getElementById(id); if (el) el.innerHTML = deptHtml; });

  var roomOpts = '<option value="">-- เลือกห้องประชุม --</option>';
  STATE.rooms.forEach(function(r) { roomOpts += '<option value="' + escapeHtml(r.RoomID) + '">' + escapeHtml(r.RoomName) + ' (จุ ' + r.Capacity + ' คน)</option>'; });
  var bkRoom = document.getElementById('bkRoomId'); if (bkRoom) bkRoom.innerHTML = roomOpts;

  var filterOpts = '<option value="">ทุกห้องประชุม</option>';
  STATE.rooms.forEach(function(r) { filterOpts += '<option value="' + escapeHtml(r.RoomID) + '">' + escapeHtml(r.RoomName) + '</option>'; });
  ['searchRoom', 'calendarRoomFilter'].forEach(function(id) { var el = document.getElementById(id); if (el) el.innerHTML = filterOpts; });
}

function navigateTo(view) {
  var restrictedViews = ['calendar', 'mybookings', 'stats', 'booking'];
  if (restrictedViews.indexOf(view) !== -1 && !STATE.user.authenticated) {
    Swal.fire({ icon: 'info', title: 'ต้องเข้าสู่ระบบก่อน', text: 'กรุณาเข้าสู่ระบบบุคลากรเพื่อใช้งานส่วนนี้', confirmButtonColor: '#0f4c81' }).then(function() { openLoginModal(); });
    return;
  }
  if ((view === 'approval' || view === 'admin') && ['Admin', 'Approver'].indexOf(STATE.user.role) === -1) {
    Swal.fire({ icon: 'warning', title: 'ไม่มีสิทธิ์เข้าถึง', text: 'หน้านี้สงวนสิทธิ์เฉพาะผู้ดูแลระบบหรือผู้อนุมัติเท่านั้น', confirmButtonColor: '#0f4c81' });
    return;
  }

  var isKiosk = (view === 'kiosk');
  var sidebar = document.getElementById('sidebar');
  var sidebarOverlay = document.getElementById('sidebarOverlay');
  var mainHeaderBar = document.querySelector('.app-header');
  var mainLayoutContent = document.querySelector('.main-content');

  if (isKiosk) {
    stopNotificationPolling();
    startKioskMode();
    if (sidebar) sidebar.style.display = 'none';
    if (sidebarOverlay) sidebarOverlay.style.display = 'none';
    if (mainHeaderBar) mainHeaderBar.style.display = 'none';
    if (mainLayoutContent) mainLayoutContent.style.marginLeft = '0';
  } else {
    stopKioskMode();
    if (sidebar) sidebar.style.display = '';
    if (sidebarOverlay) sidebarOverlay.style.display = '';
    if (mainHeaderBar) mainHeaderBar.style.display = '';
    if (mainLayoutContent) mainLayoutContent.style.marginLeft = '';
    if (STATE.user && STATE.user.authenticated) startNotificationPolling();
  }

  var views = document.querySelectorAll('.app-view');
  views.forEach(function(v) { v.classList.remove('active'); if (v.id === 'view-kiosk') v.style.display = 'none'; });
  var target = document.getElementById('view-' + view);
  if (target) { target.classList.add('active'); if (isKiosk) target.style.display = 'block'; }

  var btns = document.querySelectorAll('.nav-item, .mobile-bottom-btn');
  btns.forEach(function(b) { b.classList.toggle('active', b.getAttribute('data-view') === view); });

  var titles = {
    dashboard: 'Dashboard ภาพรวมระบบ', booking: 'จองห้องประชุมออนไลน์', approval: 'อนุมัติการจองห้องประชุม',
    calendar: 'ตารางการใช้ห้องประชุม', rooms: 'ข้อมูลห้องประชุมทั้งหมด', mybookings: 'รายการจองของฉัน',
    stats: 'สถิติและค้นหารายการจอง', admin: 'จัดการระบบและอนุมัติการจอง', kiosk: 'ระบบแสดงสถานะห้องประชุมหน้าห้อง (Kiosk)'
  };
  var pageTitle = document.getElementById('pageTitle');
  if (pageTitle) pageTitle.textContent = titles[view] || 'ระบบจองห้องประชุม';

  toggleSidebar(false);

  if (view === 'dashboard') loadDashboard();
  else if (view === 'booking') handleDateSelectionChange(document.getElementById('availCheckDate').value || todayIso(), 'availCheckDate');
  else if (view === 'approval') loadApprovalViewData();
  else if (view === 'calendar') loadCalendarEvents();
  else if (view === 'rooms') renderRoomsDirectory();
  else if (view === 'mybookings') loadMyBookings();
  else if (view === 'stats') runBookingSearch();
  else if (view === 'admin') loadAdminView();
  else if (view === 'kiosk') loadKioskData();
}

/* ==========================================================================
 * Real-time Polling & Notifications
 * ======================================================================== */
var POLL_INTERVAL_MS = 15000;
function refreshBadgesImmediately() { if (STATE.user.authenticated) fetchNotificationBadgesSilent(false); }

function startNotificationPolling() {
  stopNotificationPolling();
  if (!STATE.user.authenticated) return;
  fetchNotificationBadgesSilent(true);
  STATE.pollTimer = setInterval(function() { if (!document.hidden) fetchNotificationBadgesSilent(false); }, POLL_INTERVAL_MS);
}

function stopNotificationPolling() {
  if (STATE.pollTimer) { clearInterval(STATE.pollTimer); STATE.pollTimer = null; }
  STATE.lastBadgeBookings = null; STATE.lastBadgeUsers = null;
  document.title = 'ระบบจองห้องประชุมออนไลน์ | เทศบาลเมืองสมุทรสงคราม';
}

document.addEventListener('visibilitychange', function() { if (!document.hidden && STATE.user.authenticated) fetchNotificationBadgesSilent(false); });

function fetchNotificationBadgesSilent(isInitial) {
  if (!STATE.user.authenticated) return;

  if (['Admin', 'Approver'].indexOf(STATE.user.role) !== -1) {
    callGas('getNotificationBadges', STATE.token)
      .then(function(res) {
        var data = res.data || { pendingBookings: 0, pendingUsers: 0, latestCancelled: null };
        var newBookings = Number(data.pendingBookings) || 0;
        var newUsers = Number(data.pendingUsers) || 0;

        updatePendingBadgeCount(newBookings);
        if (STATE.user.role === 'Admin') updateAdminPendingBadge(newUsers);

        var totalAlert = newBookings + (STATE.user.role === 'Admin' ? newUsers : 0);
        document.title = (totalAlert > 0 ? '(' + totalAlert + ') ' : '') + 'ระบบจองห้องประชุมออนไลน์ | เทศบาลเมืองสมุทรสงคราม';

        if (data.latestCancelled) {
          var cancelObj = data.latestCancelled;
          var cancelKey = cancelObj.bookingId + '_' + cancelObj.cancelDate;
          var lastAckCancel = localStorage.getItem('LAST_ACK_CANCEL_KEY') || '';

          if (isInitial) {
            if (!lastAckCancel) localStorage.setItem('LAST_ACK_CANCEL_KEY', cancelKey);
          } else if (cancelKey !== lastAckCancel) {
            localStorage.setItem('LAST_ACK_CANCEL_KEY', cancelKey);
            Swal.fire({
              icon: 'warning', title: '⚠️ มีการยกเลิกการจองห้องประชุม!',
              html: '<div style="text-align:left; font-size:14px; line-height:1.6;">รหัสการจอง: <strong>' + escapeHtml(cancelObj.bookingId) + '</strong><br>ห้องประชุม: <strong>' + escapeHtml(cancelObj.roomName) + '</strong><br>หัวข้อ: <strong>' + escapeHtml(cancelObj.topic) + '</strong><br>วันที่: ' + formatDisplayDateThai(cancelObj.date) + '<br>ผู้จอง: ' + escapeHtml(cancelObj.bookerName) + '<div style="margin-top:10px; padding:10px; background:#fef2f2; border:1px solid #fecaca; border-radius:8px; color:#991b1b; font-size:13px;"><strong>เหตุผล:</strong> ' + escapeHtml(cancelObj.cancelReason || 'ไม่ระบุ') + '</div></div>',
              confirmButtonColor: '#0f4c81', confirmButtonText: 'รับทราบ'
            });
            refreshActiveViews();
          }
        }
        STATE.lastBadgeBookings = newBookings; STATE.lastBadgeUsers = newUsers;
      })
      .catch(function() {});
  }

  callGas('searchBookings', STATE.token, { myOnly: true, userEmail: STATE.user.email })
    .then(function(res) {
      var list = res.data || [];
      var pendingCount = list.filter(function(x) { var st = x.EffectiveStatus || x.Status; return st === 'รออนุมัติ'; }).length;
      updateMyBookingsBadge(pendingCount);
      checkBookerStatusUpdates(list);
    })
    .catch(function() {});
}

function updatePendingBadgeCount(count) { var b = document.getElementById('sidebarPendingBadge'); if (b) { var n = Number(count) || 0; b.textContent = n; b.style.display = n > 0 ? 'inline-block' : 'none'; } }
function updateAdminPendingBadge(count) { var b = document.getElementById('sidebarAdminBadge'); if (b) { var n = Number(count) || 0; b.textContent = n; b.style.display = n > 0 ? 'inline-block' : 'none'; } }
function updateMyBookingsBadge(count) { var b = document.getElementById('sidebarMyBookingsBadge'); if (b) { var n = Number(count) || 0; b.textContent = n; b.style.display = n > 0 ? 'inline-block' : 'none'; } }

function refreshActiveViews() {
  if (document.getElementById('view-approval').classList.contains('active')) loadApprovalViewData();
  if (document.getElementById('view-dashboard').classList.contains('active')) loadDashboard();
  if (document.getElementById('view-admin').classList.contains('active')) loadAdminBookings();
  if (document.getElementById('view-calendar').classList.contains('active')) loadCalendarEvents();
}

function checkBookerStatusUpdates(bookingsList) {
  if (!STATE.user || !STATE.user.authenticated) return;
  var storageKey = 'KNOWN_BOOKING_STATUS_' + STATE.user.email.toLowerCase();
  var knownStatuses = {};
  try { knownStatuses = JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch (e) { knownStatuses = {}; }

  var hasNewApproval = false; var hasNewRejection = false; var approvedBooking = null; var rejectedBooking = null; var statusChanged = false;

  bookingsList.forEach(function(b) {
    var id = b.BookingID; var currentStatus = b.EffectiveStatus || b.Status; var prevStatus = knownStatuses[id];
    if (prevStatus && prevStatus !== currentStatus) statusChanged = true;
    if (prevStatus === 'รออนุมัติ') {
      if (currentStatus === 'อนุมัติ' && !hasNewApproval) { hasNewApproval = true; approvedBooking = b; }
      else if (currentStatus === 'ไม่อนุมัติ' && !hasNewRejection) { hasNewRejection = true; rejectedBooking = b; }
    }
    knownStatuses[id] = currentStatus;
  });

  localStorage.setItem(storageKey, JSON.stringify(knownStatuses));

  if (statusChanged) {
    if (document.getElementById('view-mybookings').classList.contains('active') && typeof loadMyBookings === 'function') loadMyBookings();
    var pendingCount = bookingsList.filter(function(x) { var st = x.EffectiveStatus || x.Status; return st === 'รออนุมัติ'; }).length;
    updateMyBookingsBadge(pendingCount);
  }

  if (hasNewApproval && approvedBooking) {
    Swal.fire({
      icon: 'success', title: '🎉 การจองห้องได้รับการอนุมัติแล้ว!',
      html: 'รายการจอง <strong>' + escapeHtml(approvedBooking.Topic) + '</strong> (' + escapeHtml(approvedBooking.RoomName) + ')<br>วันที่ ' + formatDisplayDateThai(approvedBooking.Date) + ' ได้รับการอนุมัติแล้ว',
      confirmButtonColor: '#16a34a', confirmButtonText: '<i class="bi bi-qr-code"></i> ดูรายละเอียด & QR Code'
    }).then(function() {
      if (typeof loadMyBookings === 'function') loadMyBookings();
      openBookingDetailModal(approvedBooking.BookingID);
    });
  } else if (hasNewRejection && rejectedBooking) {
    Swal.fire({
      icon: 'warning', title: 'แจ้งผล: การจองไม่ได้รับการอนุมัติ',
      html: 'รายการจอง <strong>' + escapeHtml(rejectedBooking.Topic) + '</strong> (' + escapeHtml(rejectedBooking.RoomName) + ') ไม่ผ่านการอนุมัติ',
      confirmButtonColor: '#0f4c81', confirmButtonText: 'รับทราบ'
    }).then(function() { if (typeof loadMyBookings === 'function') loadMyBookings(); });
  }
}
/* ==========================================================================
 * Dashboard, Charts & Kiosk Mode
 * ======================================================================== */
function loadDashboard() {
  callGas('getDashboardData', STATE.token)
    .then(function(res) {
      var kpis = res.data.kpis; var charts = res.data.charts; var recentPending = res.data.recentPending || [];
      document.getElementById('kpiTotalRooms').textContent = kpis.totalRooms;
      document.getElementById('kpiAvailToday').textContent = kpis.availableRoomsToday;
      document.getElementById('kpiBookedToday').textContent = kpis.bookedRoomsToday;
      document.getElementById('kpiTotalBookings').textContent = kpis.totalBookings;
      document.getElementById('kpiPending').textContent = kpis.pendingCount;
      document.getElementById('kpiApproved').textContent = kpis.approvedCount;
      document.getElementById('kpiCancelled').textContent = kpis.cancelledCount;
      document.getElementById('kpiMostUsed').textContent = kpis.mostUsedRoom;
      document.getElementById('kpiMostUsedSub').textContent = (kpis.mostUsedCount > 0) ? ('ใช้งาน ' + kpis.mostUsedCount + ' ครั้ง') : '';

      updatePendingBadgeCount(kpis.pendingCount);

      renderBarChart('chartByRoom', charts.byRoom.labels, charts.byRoom.values, 'จำนวนครั้งที่ใช้งาน', '#0284c7');
      renderLineChart('chartByMonth', charts.byMonth.labels, charts.byMonth.values);
      renderDoughnutChart('chartByStatus', charts.byStatus.labels, charts.byStatus.values);
      if (charts.byDepartment) renderHorizontalBarChart('chartByDepartment', charts.byDepartment.labels, charts.byDepartment.values, 'จำนวนการจอง', '#0d9488');

      var pendingCardContainer = document.getElementById('dashPendingCardContainer');
      var isPrivileged = STATE.user.authenticated && ['Admin', 'Approver'].indexOf(STATE.user.role) !== -1;
      if (pendingCardContainer) pendingCardContainer.style.display = isPrivileged ? 'block' : 'none';

      if (isPrivileged) {
        var tbody = document.getElementById('dashPendingBody');
        if (tbody) {
          if (recentPending.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--muted); padding:16px;">ไม่มีรายการรออนุมัติ</td></tr>';
          } else {
            var html = '';
            recentPending.forEach(function(b) {
              html += '<tr><td><strong>' + escapeHtml(b.BookingID) + '</strong></td><td>' + formatDisplayDateThai(b.Date) + '<br><small>' + escapeHtml(b.StartTime) + '–' + escapeHtml(b.EndTime) + '</small></td><td>' + escapeHtml(b.RoomName) + '</td><td>' + escapeHtml(b.Topic) + '</td><td>' + escapeHtml(b.BookerName) + '<br><small>' + escapeHtml(b.Department) + '</small></td><td>' + statusBadge(b.Status) + '</td><td style="white-space:nowrap;"><button class="btn btn-success btn-sm" onclick="approveFromDashboard(\'' + escapeHtml(b.BookingID) + '\')"><i class="bi bi-check-lg"></i> อนุมัติ</button> <button class="btn btn-danger btn-sm" onclick="rejectFromDashboard(\'' + escapeHtml(b.BookingID) + '\')"><i class="bi bi-x-lg"></i> ไม่อนุมัติ</button></td></tr>';
            });
            tbody.innerHTML = html;
          }
        }
      }
    })
    .catch(function(err) { showToast(err.message, 'error'); });
}

function renderBarChart(id, l, d, lbl, c) { if (STATE.charts[id]) STATE.charts[id].destroy(); var ctx = document.getElementById(id); if (!ctx) return; STATE.charts[id] = new Chart(ctx, { type: 'bar', data: { labels: l, datasets: [{ label: lbl, data: d, backgroundColor: c, borderRadius: 6 }] }, options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } } }); }
function renderLineChart(id, l, d) { if (STATE.charts[id]) STATE.charts[id].destroy(); var ctx = document.getElementById(id); if (!ctx) return; STATE.charts[id] = new Chart(ctx, { type: 'line', data: { labels: l, datasets: [{ label: 'จำนวนการจอง', data: d, borderColor: '#0d9488', backgroundColor: 'rgba(13,148,136,0.12)', fill: true, tension: 0.32 }] }, options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } } }); }
function renderDoughnutChart(id, l, d) { if (STATE.charts[id]) STATE.charts[id].destroy(); var ctx = document.getElementById(id); if (!ctx) return; STATE.charts[id] = new Chart(ctx, { type: 'doughnut', data: { labels: l, datasets: [{ data: d, backgroundColor: ['#16a34a', '#d97706', '#64748b', '#dc2626'] }] }, options: { responsive: true } }); }
function renderHorizontalBarChart(id, l, d, lbl, c) { if (STATE.charts[id]) STATE.charts[id].destroy(); var ctx = document.getElementById(id); if (!ctx) return; STATE.charts[id] = new Chart(ctx, { type: 'bar', data: { labels: l, datasets: [{ label: lbl, data: d, backgroundColor: c, borderRadius: 6 }] }, options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { precision: 0 } } } } }); }

function approveFromDashboard(id) { setLoading(true, 'กำลังอนุมัติ...'); callGas('updateBookingStatus', STATE.token, id, 'อนุมัติ', '').then(function() { showToast('อนุมัติสำเร็จ', 'success'); loadDashboard(); refreshBadgesImmediately(); }).catch(function(e) { showToast(e.message, 'error'); }).finally(function() { setLoading(false); }); }
function rejectFromDashboard(id) {
  Swal.fire({ title: 'ระบุเหตุผลที่ไม่อนุมัติ', input: 'textarea', showCancelButton: true, confirmButtonColor: '#dc2626' }).then(function(r) {
    if (r.isConfirmed) { setLoading(true, 'กำลังบันทึก...'); callGas('updateBookingStatus', STATE.token, id, 'ไม่อนุมัติ', r.value || '').then(function() { showToast('บันทึกสำเร็จ', 'success'); loadDashboard(); refreshBadgesImmediately(); }).catch(function(e) { showToast(e.message, 'error'); }).finally(function() { setLoading(false); }); }
  });
}

/* ==========================================================================
 * Kiosk Mode Management
 * ======================================================================== */
var kioskTimer = null; var kioskClockTimer = null;
function startKioskMode() { enterFullscreen(); loadKioskData(); if (!kioskTimer) kioskTimer = setInterval(loadKioskData, 30000); if (!kioskClockTimer) kioskClockTimer = setInterval(updateKioskClock, 1000); }
function stopKioskMode() { if (kioskTimer) { clearInterval(kioskTimer); kioskTimer = null; } if (kioskClockTimer) { clearInterval(kioskClockTimer); kioskClockTimer = null; } exitFullscreen(); }
function enterFullscreen() { var el = document.documentElement; if (el.requestFullscreen) el.requestFullscreen().catch(function() {}); else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen(); }
function exitFullscreen() { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function() {}); }
function updateKioskClock() { var now = new Date(); var c = document.getElementById('kioskClock'); var d = document.getElementById('kioskDate'); if (c) c.textContent = now.toTimeString().split(' ')[0]; if (d) d.textContent = formatDisplayDateThai(todayIso()); }

function loadKioskData() {
  callGas('getKioskRoomStatus')
    .then(function(res) {
      var data = res.data; var grid = document.getElementById('kioskRoomGrid'); if (!grid) return;
      var html = '';
      data.rooms.forEach(function(r) {
        var isBusy = (r.status === 'BUSY'); var isMaint = (r.status === 'MAINTENANCE');
        var cardBg = isBusy ? '#7f1d1d' : (isMaint ? '#475569' : '#065f46');
        var statusText = isBusy ? 'กำลังใช้งาน (BUSY)' : (isMaint ? 'ปิดปรับปรุง' : 'ห้องว่าง (AVAILABLE)');
        var statusDot = isBusy ? '🔴' : (isMaint ? '🟡' : '🟢');

        html += '<div style="background: #1e293b; border: 2px solid ' + (isBusy ? '#ef4444' : (isMaint ? '#94a3b8' : '#10b981')) + '; border-radius: 16px; overflow: hidden; display: flex; flex-direction: column;">' +
          '<div style="position: relative; height: 150px; background: #334155; flex-shrink: 0;">' +
            '<img src="' + escapeHtml(r.image || 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=800') + '" style="width: 100%; height: 100%; object-fit: cover; opacity: 0.75;">' +
            '<div style="position: absolute; top: 12px; right: 12px; background: ' + cardBg + '; color: #fff; padding: 6px 14px; border-radius: 20px; font-weight: 700; font-size: 13px;">' + statusDot + ' ' + statusText + '</div>' +
            '<div style="position: absolute; bottom: 0; left: 0; right: 0; background: linear-gradient(to top, rgba(15,23,42,0.95), transparent); padding: 15px 15px 8px 15px;">' +
              '<h3 style="margin: 0; font-size: 19px; color: #fff; font-weight: 700;">' + escapeHtml(r.roomName) + '</h3>' +
              '<div style="font-size: 12px; color: #94a3b8;"><i class="bi bi-geo-alt"></i> ' + escapeHtml(r.building) + ' ชั้น ' + escapeHtml(r.floor) + ' &bull; ความจุ ' + r.capacity + ' คน</div>' +
            '</div>' +
          '</div>' +
          '<div style="padding: 16px; flex-grow: 1; display: flex; flex-direction: column;">';

        if (isBusy && r.currentMeeting) {
          var m = r.currentMeeting;
          html += '<div style="background: rgba(239, 68, 68, 0.15); border-left: 4px solid #ef4444; padding: 10px; border-radius: 0 8px 8px 0; margin-bottom: 12px;">' +
            '<div style="font-size: 11px; color: #f87171; font-weight: 700;">กำลังประชุมขณะนี้</div>' +
            '<div style="font-size: 15px; font-weight: 700; color: #fff; margin: 2px 0;">' + escapeHtml(m.Topic) + '</div>' +
            '<div style="font-size: 12.5px; color: #cbd5e1;"><i class="bi bi-clock"></i> ' + escapeHtml(m.StartTime) + ' - ' + escapeHtml(m.EndTime) + ' น.</div>' +
            '<div style="font-size: 12px; color: #94a3b8; margin-top: 4px;"><i class="bi bi-person"></i> ผู้จอง: ' + escapeHtml(m.BookerName) + ' (' + escapeHtml(m.Department) + ')</div>' +
          '</div>';
        } else {
          html += '<div style="background: rgba(16, 185, 129, 0.1); border-left: 4px solid #10b981; padding: 10px; border-radius: 0 8px 8px 0; margin-bottom: 12px; color: #34d399; font-weight: 600;">' +
            '<i class="bi bi-check-circle"></i> ห้องว่างพร้อมใช้งานในขณะนี้' +
          '</div>';
        }

        html += '<div style="font-size: 12.5px; color: #94a3b8; border-top: 1px dashed #334155; padding-top: 10px; margin-top: auto;">' +
          '<div style="font-weight: 700; color: #38bdf8; margin-bottom: 6px;"><i class="bi bi-calendar-event"></i> รายการจองถัดไป:</div>';

        if (r.nextMeetings && r.nextMeetings.length > 0) {
          html += '<div style="display: flex; flex-direction: column; gap: 6px;">';
          r.nextMeetings.forEach(function(nm, idx) {
            var dateBadge = (nm.Date !== data.date) ? '<span style="background: rgba(56,189,248,0.2); color: #38bdf8; font-size: 10.5px; padding: 1px 6px; border-radius: 4px; margin-right: 4px;">' + formatDisplayDateThai(nm.Date) + '</span>' : '';
            html += '<div style="background: rgba(30, 41, 59, 0.7); padding: 6px 10px; border-radius: 6px; border: 1px solid #334155;">' +
              '<div style="display: flex; justify-content: space-between; color: #e2e8f0; font-weight: 600;">' +
                '<span>' + (idx + 1) + '. ' + escapeHtml(nm.Topic) + '</span>' +
                '<span style="color: #38bdf8; font-size: 12px; white-space: nowrap;">' + dateBadge + escapeHtml(nm.StartTime) + '-' + escapeHtml(nm.EndTime) + '</span>' +
              '</div>' +
              '<div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">ผู้จอง: ' + escapeHtml(nm.BookerName) + ' (' + escapeHtml(nm.Department) + ')</div>' +
            '</div>';
          });
          html += '</div>';
        } else {
          html += '<div style="color: #64748b; font-style: italic;">ไม่มีรายการจองอื่นๆ เพิ่มเติม</div>';
        }

        html += '</div></div></div>';
      });
      grid.innerHTML = html;
    })
    .catch(function(err) { console.error('Kiosk Load Error:', err); });
}

/* ==========================================================================
 * Time Slots, Booking Form & Availability
 * ======================================================================== */
function updateTimeSlotOptions() {
  var startSelect = document.getElementById('bkStart'); var endSelect = document.getElementById('bkEnd'); var dateInput = document.getElementById('bkDate');
  if (!startSelect || !endSelect || !dateInput) return;
  var selectedDate = dateInput.value; var isToday = (selectedDate === todayIso());
  var openMin = timeToMinutes(extractCleanTime(STATE.settings.OPEN_HOUR, '07:00'));
  var closeMin = timeToMinutes(extractCleanTime(STATE.settings.CLOSE_HOUR, '20:00'));
  var nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  var startOptions = ''; var validStartCount = 0; var firstValidStart = null; var prevStart = startSelect.value;

  for (var m = openMin; m < closeMin; m += 30) {
    if (isToday && m <= nowMinutes) continue;
    var timeStr = minutesToTime(m);
    if (!firstValidStart) firstValidStart = timeStr;
    validStartCount++;
    startOptions += '<option value="' + timeStr + '" ' + (timeStr === prevStart ? 'selected' : '') + '>' + timeStr + ' น.</option>';
  }

  if (validStartCount === 0 && isToday) {
    startSelect.innerHTML = '<option value="">-- หมดเวลาจองวันนี้ --</option>'; endSelect.innerHTML = '<option value="">-- ไม่ได้ --</option>';
    disableTimePresets(true); updateDurationBadge(); return;
  }

  startSelect.innerHTML = startOptions;
  var hasPrev = Array.from(startSelect.options).some(function(o) { return o.value === prevStart; });
  startSelect.value = hasPrev ? prevStart : firstValidStart;
  rebuildEndTimeOptions();
  disablePastPresetButtons(isToday, nowMinutes);
}

function disablePastPresetButtons(isToday, nowMinutes) {
  var presets = document.querySelectorAll('.time-preset-btn');
  if (!isToday) { presets.forEach(function(b) { b.disabled = false; b.style.opacity = '1'; b.style.pointerEvents = 'auto'; }); return; }
  if (presets[0]) { var pm = (nowMinutes >= timeToMinutes('12:00')); presets[0].disabled = pm; presets[0].style.opacity = pm ? '0.35' : '1'; }
  if (presets[1]) { var pa = (nowMinutes >= timeToMinutes('16:30')); presets[1].disabled = pa; presets[1].style.opacity = pa ? '0.35' : '1'; }
  if (presets[2]) { var pf = (nowMinutes >= timeToMinutes('08:30')); presets[2].disabled = pf; presets[2].style.opacity = pf ? '0.35' : '1'; }
}

function disableTimePresets(disabled) { document.querySelectorAll('.time-preset-btn').forEach(function(b) { b.disabled = disabled; b.style.opacity = disabled ? '0.35' : '1'; }); }

function rebuildEndTimeOptions() {
  var startSelect = document.getElementById('bkStart'); var endSelect = document.getElementById('bkEnd');
  if (!startSelect || !endSelect) return;
  var startTime = startSelect.value; if (!startTime) return;
  var startMin = timeToMinutes(startTime); var closeMin = timeToMinutes(extractCleanTime(STATE.settings.CLOSE_HOUR, '20:00'));
  var endOptions = ''; var prevEnd = endSelect.value;

  for (var m = startMin + 30; m <= closeMin; m += 30) {
    var timeStr = minutesToTime(m);
    endOptions += '<option value="' + timeStr + '" ' + (timeStr === prevEnd ? 'selected' : '') + '>' + timeStr + ' น.</option>';
  }
  endSelect.innerHTML = endOptions;
  var hasPrevEnd = Array.from(endSelect.options).some(function(o) { return o.value === prevEnd; });
  if (hasPrevEnd && timeToMinutes(prevEnd) > startMin) endSelect.value = prevEnd;
  else endSelect.value = minutesToTime(Math.min(closeMin, startMin + 60));
  updateDurationBadge();
}

function onStartTimeChanged() { rebuildEndTimeOptions(); updateDurationBadge(); }
function onEndTimeChanged() { updateDurationBadge(); }

function updateDurationBadge() {
  var startEl = document.getElementById('bkStart');
  var endEl = document.getElementById('bkEnd');
  var badge = document.getElementById('bookingDurationText');
  if (!badge || !startEl || !endEl || !startEl.value || !endEl.value) return;

  var diff = timeToMinutes(endEl.value) - timeToMinutes(startEl.value);
  if (diff <= 0) {
    badge.innerHTML = '<i class="bi bi-exclamation-triangle"></i> เวลาไม่ถูกต้อง';
    badge.style.background = '#fee2e2';
    badge.style.color = '#991b1b';
    return;
  }
  
  var h = Math.floor(diff / 60);
  var m = diff % 60;
  var str = (h > 0 ? h + ' ชม. ' : '') + (m > 0 ? m + ' นาที' : '');
  
  badge.innerHTML = '<i class="bi bi-hourglass-split"></i> รวม ' + str;
  badge.style.background = '#f0fdf4';
  badge.style.color = '#166534';
}

function applyTimePreset(startTime, endTime, btn) {
  var startSelect = document.getElementById('bkStart'); var endSelect = document.getElementById('bkEnd');
  var isToday = (document.getElementById('bkDate').value === todayIso());
  if (isToday && timeToMinutes(startTime) <= new Date().getHours() * 60 + new Date().getMinutes()) { showToast('เวลาผ่านไปแล้วสำหรับวันนี้', 'warning'); return; }
  ensureTimeOptionExists(startSelect, startTime); startSelect.value = startTime;
  rebuildEndTimeOptions();
  ensureTimeOptionExists(endSelect, endTime); endSelect.value = endTime;
  document.querySelectorAll('.time-preset-btn').forEach(function(b) { b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  updateDurationBadge(); triggerAutoCheckAvailability();
}

function applyTimeDuration(mins, btn) {
  var start = document.getElementById('bkStart').value; if (!start) return;
  var endStr = minutesToTime(Math.min(timeToMinutes(extractCleanTime(STATE.settings.CLOSE_HOUR, '20:00')), timeToMinutes(start) + mins));
  var endSelect = document.getElementById('bkEnd');
  ensureTimeOptionExists(endSelect, endStr); endSelect.value = endStr;
  document.querySelectorAll('.time-preset-btn').forEach(function(b) { b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  updateDurationBadge(); triggerAutoCheckAvailability();
}

var autoCheckTimer = null;
function triggerAutoCheckAvailability() { if (autoCheckTimer) clearTimeout(autoCheckTimer); autoCheckTimer = setTimeout(performLiveAvailabilityCheck, 350); }

function performLiveAvailabilityCheck() {
  var roomId = document.getElementById('bkRoomId').value; var date = document.getElementById('bkDate').value;
  var startTime = document.getElementById('bkStart').value; var endTime = document.getElementById('bkEnd').value;
  var banner = document.getElementById('liveAvailStatusBox'); if (!banner) return;
  if (!roomId || !date || !startTime || !endTime) { banner.innerHTML = ''; return; }
  
  if (timeToMinutes(startTime) >= timeToMinutes(endTime)) {
    banner.innerHTML = '<div style="background: #fef2f2; border-left: 5px solid #dc2626; padding: 14px 18px; border-radius: 10px; color: #991b1b; display: flex; align-items: center; gap: 12px;"><i class="bi bi-exclamation-triangle-fill" style="font-size:22px; color:#dc2626;"></i><div style="font-weight:600;">เวลาเริ่มต้นต้องน้อยกว่าเวลาสิ้นสุด</div></div>';
    return;
  }

  banner.innerHTML = '<div style="background: #f8fafc; border-left: 5px solid #0284c7; padding: 14px 18px; border-radius: 10px; color: #475569; display: flex; align-items: center; gap: 12px;"><i class="bi bi-arrow-repeat spin" style="font-size:22px; color:#0284c7;"></i><div style="font-weight:600;">กำลังตรวจสอบตารางการใช้ห้องประชุม...</div></div>';

  callGas('checkRoomAvailability', { roomId: roomId, date: date, startTime: startTime, endTime: endTime })
    .then(function(res) {
      var avail = res.data;
      if (avail.available) {
        banner.innerHTML = '<div style="background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); border-left: 5px solid #16a34a; padding: 16px 20px; border-radius: 12px; color: #166534; display: flex; align-items: center; gap: 14px;"><div style="background: #16a34a; color: #fff; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0;"><i class="bi bi-check-lg"></i></div><div><div style="font-size: 15px; font-weight: 700; color: #14532d;">ห้องว่าง พร้อมจองใช้งาน!</div><div style="font-size: 13.5px; margin-top: 2px;">ในช่วงเวลา <strong>' + startTime + ' - ' + endTime + ' น.</strong></div></div></div>';
      } else {
        var html = '<div style="background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%); border-left: 5px solid #dc2626; padding: 16px 20px; border-radius: 12px; color: #991b1b;"><div style="display: flex; align-items: flex-start; gap: 14px;"><div style="background: #dc2626; color: #fff; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0;"><i class="bi bi-x-lg"></i></div><div style="width: 100%;"><div style="font-size: 15px; font-weight: 700; color: #7f1d1d;">ไม่สามารถจองได้ เนื่องจากห้องถูกใช้งานในช่วงเวลานี้แล้ว</div>';
        if (avail.suggestedSlots && avail.suggestedSlots.length > 0) {
          html += '<div style="margin-top: 10px; font-size: 13px;">ช่วงเวลาว่างใกล้เคียง:</div><div style="margin-top: 6px; display: flex; flex-wrap: wrap; gap: 8px;">';
          avail.suggestedSlots.forEach(function(s) {
            html += '<button type="button" style="background: #fff; border: 1px solid #fca5a5; color: #991b1b; font-weight: 600; font-size: 12px; padding: 5px 10px; border-radius: 20px; cursor: pointer;" onclick="applyTimePreset(\'' + s.startTime + '\',\'' + s.endTime + '\')"><i class="bi bi-clock"></i> ' + s.startTime + ' - ' + s.endTime + ' น.</button>';
          });
          html += '</div>';
        }
        html += '</div></div></div>';
        banner.innerHTML = html;
      }
    })
    .catch(function(err) { banner.innerHTML = '<div style="background:#fef2f2; border-left:5px solid #dc2626; padding:14px; border-radius:10px; color:#991b1b;">' + escapeHtml(err.message) + '</div>'; });
}

/* ==========================================================================
 * Date Synchronization & Room Availability Grid
 * ======================================================================== */
function handleDateSelectionChange(selectedDate) {
  if (!selectedDate) return;
  var availInput = document.getElementById('availCheckDate'); var bkInput = document.getElementById('bkDate');
  if (availInput && availInput.value !== selectedDate) { availInput.value = selectedDate; if (availInput._flatpickr) availInput._flatpickr.setDate(selectedDate, false); }
  if (bkInput && bkInput.value !== selectedDate) { bkInput.value = selectedDate; if (bkInput._flatpickr) bkInput._flatpickr.setDate(selectedDate, false); }

  document.querySelectorAll('.time-preset-btn').forEach(function(b) { b.disabled = false; b.style.opacity = '1'; b.style.pointerEvents = 'auto'; });
  updateTimeSlotOptions();
  fetchAndRenderRoomAvailability(selectedDate);
}

function syncDateFromForm() { var bk = document.getElementById('bkDate'); if (bk && bk.value) handleDateSelectionChange(bk.value); }
function onBookingDateChanged() { var av = document.getElementById('availCheckDate'); if (av && av.value) handleDateSelectionChange(av.value); }

function fetchAndRenderRoomAvailability(dateVal) {
  var container = document.getElementById('roomAvailCards'); if (!container) return;
  container.innerHTML = '<div style="color:var(--muted); padding:10px 0;"><i class="bi bi-arrow-repeat spin"></i> กำลังตรวจสอบสถานะห้อง...</div>';

  callGas('getRoomAvailabilityForDate', dateVal)
    .then(function(res) {
      var rooms = res.data.rooms || []; var currentSelected = document.getElementById('bkRoomId').value; var html = '';
      rooms.forEach(function(r) {
        var isFree = (r.statusType === 'FREE'); var dot = isFree ? '🟢' : '🔴'; var statusCls = isFree ? 'avail-free' : 'avail-busy';
        var selectedCls = (r.RoomID === currentSelected) ? 'selected' : '';
        var statusHtml = isFree ? '— ว่างทั้งวัน' : (r.statusType === 'FULL' ? '— <span style="color:#dc2626; font-weight:600;">ไม่ว่างทั้งวัน</span>' : '— <span style="color:#d97706; font-weight:600;">มีช่วงเวลาที่ไม่ว่าง</span>');

        html += '<div class="avail-item ' + selectedCls + '" data-room-id="' + escapeHtml(r.RoomID) + '" onclick="selectRoomFromAvail(\'' + escapeHtml(r.RoomID) + '\')"><div style="display:flex; justify-content:space-between; align-items:center;"><strong>' + escapeHtml(r.RoomName) + '</strong><small style="color:var(--muted);">จุ ' + r.Capacity + ' คน</small></div><div class="avail-status ' + statusCls + '" style="margin-top:6px;">' + dot + ' ' + statusHtml + '</div></div>';
      });
      container.innerHTML = html;
    })
    .catch(function(err) { container.innerHTML = '<div class="alert alert-danger">' + escapeHtml(err.message) + '</div>'; });
}

function selectRoomFromAvail(roomId) { var sel = document.getElementById('bkRoomId'); if (sel) sel.value = roomId; syncSelectedRoomCard(); triggerAutoCheckAvailability(); }
function syncSelectedRoomCard() { var selId = document.getElementById('bkRoomId').value; document.querySelectorAll('.avail-item').forEach(function(el) { el.classList.toggle('selected', el.getAttribute('data-room-id') === selId); }); }

/* ==========================================================================
 * Layouts, Booking Submission, Search & My Bookings
 * ======================================================================== */
function renderBookingLayoutCards() {
  var container = document.getElementById('bookingLayoutGrid'); if (!container || !STATE.layouts) return;
  var currentVal = document.getElementById('bkSeatingLayout').value || 'แบบชั้นเรียน (Classroom)'; var html = '';
  STATE.layouts.forEach(function(l) {
    var isSelected = (l.name === currentVal || l.id === currentVal) ? 'selected' : '';
    html += '<div class="layout-card ' + isSelected + '" id="layout-card-' + l.id + '" onclick="selectSeatingLayout(\'' + l.id + '\')"><div class="layout-media-wrap"><img id="img-layout-' + l.id + '" src="' + escapeHtml(l.diagramUrl) + '"><div class="layout-tab-pill" onclick="event.stopPropagation();"><button type="button" class="layout-tab-btn active" id="btn-dia-' + l.id + '" onclick="toggleCardImage(\'' + l.id + '\', \'diagram\')">แผนผัง</button><button type="button" class="layout-tab-btn" id="btn-pho-' + l.id + '" onclick="toggleCardImage(\'' + l.id + '\', \'photo\')">ภาพจริง</button></div></div><div class="layout-info"><div class="layout-title">' + escapeHtml(l.name) + '</div><div class="layout-desc">' + escapeHtml(l.desc) + '</div><button type="button" class="btn-preview-layout" onclick="event.stopPropagation(); openLayoutBigPreview(\'' + l.id + '\')"><i class="bi bi-zoom-in"></i> ขยายดูรูปใหญ่</button></div></div>';
  });
  container.innerHTML = html;
}

function toggleCardImage(layoutId, mode) {
  var layout = STATE.layouts.find(function(x) { return x.id === layoutId; }); if (!layout) return;
  var img = document.getElementById('img-layout-' + layoutId); var btnDia = document.getElementById('btn-dia-' + layoutId); var btnPho = document.getElementById('btn-pho-' + layoutId);
  if (!img) return;
  if (mode === 'diagram') { img.src = layout.diagramUrl; if(btnDia)btnDia.classList.add('active'); if(btnPho)btnPho.classList.remove('active'); }
  else { img.src = layout.photoUrl; if(btnPho)btnPho.classList.add('active'); if(btnDia)btnDia.classList.remove('active'); }
}

function selectSeatingLayout(layoutId) {
  var layout = STATE.layouts.find(function(x) { return x.id === layoutId; }); if (!layout) return;
  var input = document.getElementById('bkSeatingLayout'); if (input) input.value = layout.name;
  document.querySelectorAll('.layout-card').forEach(function(c) { c.classList.remove('selected'); });
  var activeCard = document.getElementById('layout-card-' + layoutId); if (activeCard) activeCard.classList.add('selected');
}

function onMeetingTypeChanged() {
  var typeSelect = document.getElementById('bkMeetingType'); if (!typeSelect) return;
  var map = { 'On-site': 'classroom', 'Online': 'boardroom', 'Hybrid': 'ushape' };
  selectSeatingLayout(map[typeSelect.value] || 'classroom');
}

function openLayoutBigPreview(layoutId) {
  var layout = STATE.layouts.find(function(x) { return x.id === layoutId; }); if (!layout) return;
  STATE.currentPreviewLayout = layout;
  document.getElementById('layoutPreviewTitle').innerHTML = '<i class="bi bi-grid-3x3-gap"></i> รูปแบบ: ' + escapeHtml(layout.name);
  document.getElementById('layoutPreviewDesc').textContent = layout.desc;
  switchPreviewMode('photo'); openModal('layoutPreviewModal');
}

function switchPreviewMode(mode) {
  if (!STATE.currentPreviewLayout) return;
  var img = document.getElementById('layoutBigImage'); var btnDia = document.getElementById('btnShowDiagram'); var btnPho = document.getElementById('btnShowPhoto');
  if (!img) return;
  if (mode === 'diagram') { img.src = STATE.currentPreviewLayout.diagramUrl; if (btnDia) btnDia.className = 'btn btn-primary btn-sm'; if (btnPho) btnPho.className = 'btn btn-outline btn-sm'; }
  else { img.src = STATE.currentPreviewLayout.photoUrl; if (btnPho) btnPho.className = 'btn btn-primary btn-sm'; if (btnDia) btnDia.className = 'btn btn-outline btn-sm'; }
}

function submitBookingForm(e) {
  e.preventDefault();
  var payload = {
    bookerName: document.getElementById('bkName').value.trim(), department: document.getElementById('bkDept').value,
    phone: document.getElementById('bkPhone').value.trim(), userEmail: document.getElementById('bkEmail').value.trim(),
    roomId: document.getElementById('bkRoomId').value, date: document.getElementById('bkDate').value,
    startTime: document.getElementById('bkStart').value, endTime: document.getElementById('bkEnd').value,
    topic: document.getElementById('bkTopic').value.trim(), participants: Number(document.getElementById('bkParticipants').value),
    seatingLayout: document.getElementById('bkSeatingLayout').value, meetingType: document.getElementById('bkMeetingType').value,
    equipment: document.getElementById('bkEquipment').value.trim(), detail: document.getElementById('bkDetail').value.trim()
  };
  if (timeToMinutes(payload.startTime) >= timeToMinutes(payload.endTime)) { Swal.fire({ icon: 'warning', title: 'เวลาไม่ถูกต้อง', text: 'เวลาเริ่มต้นต้องน้อยกว่าเวลาสิ้นสุด', confirmButtonColor: '#0f4c81' }); return; }
  showBookingSummaryConfirmation(payload);
}

function showBookingSummaryConfirmation(payload) {
  var room = STATE.rooms.find(function(r) { return r.RoomID === payload.roomId; }) || {};
  var summaryHtml = '<div style="text-align:left; font-size:14px; line-height:1.6;"><div style="background:#f0f9ff; border:1px solid #bae6fd; border-radius:12px; padding:12px 16px; margin-bottom:14px;"><div style="font-weight:700; color:#0f4c81; font-size:16px;">🏢 ' + escapeHtml(room.RoomName) + '</div><div style="font-size:13.5px; color:#0284c7; font-weight:600; margin-top:6px;"><i class="bi bi-calendar3"></i> ' + formatDisplayDateThai(payload.date) + ' &bull; ' + escapeHtml(payload.startTime) + ' - ' + escapeHtml(payload.endTime) + ' น.</div></div><table style="width:100%; font-size:13.5px;"><tr><td style="color:#64748b; width:120px; padding:4px 0;">หัวข้อ:</td><td style="font-weight:700;">' + escapeHtml(payload.topic) + '</td></tr><tr><td style="color:#64748b; padding:4px 0;">ผู้จอง:</td><td>' + escapeHtml(payload.bookerName) + ' (' + escapeHtml(payload.department) + ')</td></tr><tr><td style="color:#64748b; padding:4px 0;">ผังโต๊ะ:</td><td style="color:#0d9488; font-weight:700;">' + escapeHtml(payload.seatingLayout) + '</td></tr></table></div>';

  Swal.fire({
    title: '📋 สรุปและยืนยันการจอง', html: summaryHtml, icon: 'info', showCancelButton: true,
    confirmButtonColor: '#0f4c81', cancelButtonColor: '#64748b', confirmButtonText: 'ยืนยันการจองห้อง', cancelButtonText: 'กลับไปแก้ไข', reverseButtons: true
  }).then(function(r) { if (r.isConfirmed) executeBookingSubmit(payload); });
}

function executeBookingSubmit(payload) {
  var btn = document.getElementById('btnSubmitBooking'); if (btn) btn.disabled = true;
  setLoading(true, 'กำลังบันทึกการจอง...');
  callGas('createBooking', STATE.token, payload)
    .then(function(res) {
      if (!res.success && res.code === 'CONFLICT') { performLiveAvailabilityCheck(); Swal.fire({ icon: 'warning', title: 'เวลาทับซ้อนกัน', text: res.message, confirmButtonColor: '#0f4c81' }); return; }
      refreshBadgesImmediately(); if (typeof loadCalendarEvents === 'function') loadCalendarEvents();
      document.getElementById('bookingForm').reset();
      navigateTo('mybookings');
      Swal.fire({ icon: 'success', title: 'จองห้องสำเร็จ!', html: 'รหัสการจอง: <strong>' + escapeHtml(res.data.booking.BookingID) + '</strong>', confirmButtonColor: '#0f4c81', timer: 2500 });
    })
    .catch(function(err) { Swal.fire({ icon: 'error', title: 'บันทึกไม่สำเร็จ', text: err.message, confirmButtonColor: '#0f4c81' }); })
    .finally(function() { if (btn) btn.disabled = false; setLoading(false); });
}

function renderRoomsDirectory() {
  var grid = document.getElementById('roomsDirectoryGrid'); if (!grid) return; var html = '';
  STATE.rooms.forEach(function(r) {
    var img = r.ImageURL || 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=800';
    html += '<div style="background:#fff; border:1px solid var(--border); border-radius:12px; overflow:hidden; display:flex; flex-direction:column; box-shadow:0 1px 3px 0 rgba(0,0,0,0.05);"><div style="position:relative; height:200px; background:#e2e8f0; overflow:hidden;"><img src="' + escapeHtml(img) + '" style="width:100%; height:100%; object-fit:cover;"><span class="badge badge-approved" style="position:absolute; top:12px; right:12px; font-weight:700;">' + r.Capacity + ' ที่นั่ง</span></div><div style="padding:18px; flex-grow:1; display:flex; flex-direction:column;"><h3 style="font-size:18px; color:var(--primary); font-weight:700; margin-bottom:6px;">' + escapeHtml(r.RoomName) + '</h3><div style="font-size:13.5px; color:var(--muted); margin-bottom:10px;"><i class="bi bi-geo-alt"></i> ' + escapeHtml(r.Building) + ' ชั้น ' + escapeHtml(r.Floor) + '</div><p style="font-size:13.5px; color:#475569; margin-bottom:12px;">' + escapeHtml(r.Description || '') + '</p><button class="btn btn-primary btn-sm" style="margin-top:auto; width:100%; justify-content:center;" onclick="quickBookRoom(\'' + escapeHtml(r.RoomID) + '\')"><i class="bi bi-calendar-plus"></i> จองห้องนี้</button></div></div>';
  });
  grid.innerHTML = html;
}

function quickBookRoom(roomId) {
  if (!STATE.user.authenticated) { Swal.fire({ icon: 'info', title: 'ต้องเข้าสู่ระบบก่อน', confirmButtonColor: '#0f4c81' }).then(function() { openLoginModal(); }); return; }
  navigateTo('booking'); setTimeout(function() { selectRoomFromAvail(roomId); }, 150);
}

function loadMyBookings() {
  var emailInput = document.getElementById('myBookingEmailInput').value.trim(); var tbody = document.getElementById('myBookingsBody'); if (!tbody) return;
  if (!STATE.user.authenticated && !emailInput) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--muted); padding:16px;">กรุณากรอกอีเมลหรือเข้าสู่ระบบ</td></tr>'; return; }

  setLoading(true, 'กำลังโหลด...');
  callGas('searchBookings', STATE.token, { myOnly: true, userEmail: emailInput })
    .then(function(res) {
      var list = res.data || [];
      var pendingCount = list.filter(function(x) { var st = x.EffectiveStatus || x.Status; return st === 'รออนุมัติ'; }).length;
      updateMyBookingsBadge(pendingCount);
      checkBookerStatusUpdates(list);

      if (list.length === 0) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--muted); padding:16px;">ไม่พบรายการจอง</td></tr>'; return; }
      var html = '';
      list.forEach(function(b) {
        var st = b.EffectiveStatus || b.Status; var canCancel = (STATE.user.authenticated && (st === 'รออนุมัติ' || st === 'อนุมัติ'));
        var cancelBtn = canCancel ? ('<button class="btn btn-danger btn-sm" onclick="cancelMyBooking(\'' + escapeHtml(b.BookingID) + '\')"><i class="bi bi-x-circle"></i> ยกเลิก</button>') : '';
        html += '<tr><td><strong>' + escapeHtml(b.BookingID) + '</strong></td><td>' + formatDisplayDateThai(b.Date) + '<br><small>' + escapeHtml(b.StartTime) + '–' + escapeHtml(b.EndTime) + ' น.</small></td><td>' + escapeHtml(b.RoomName) + '</td><td>' + escapeHtml(b.Topic) + '</td><td>' + statusBadge(st) + '</td><td style="white-space:nowrap;"><button class="btn btn-outline btn-sm" onclick="openBookingDetailModal(\'' + escapeHtml(b.BookingID) + '\')"><i class="bi bi-qr-code"></i></button> ' + cancelBtn + '</td></tr>';
      });
      tbody.innerHTML = html;
    })
    .catch(function(e) { showToast(e.message, 'error'); })
    .finally(function() { setLoading(false); });
}

function cancelMyBooking(bookingId) {
  Swal.fire({
    title: 'ยกเลิกการจองห้องประชุม', input: 'textarea', inputPlaceholder: 'ระบุเหตุผลในการยกเลิก...', icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc2626', confirmButtonText: 'ยืนยันยกเลิก'
  }).then(function(r) {
    if (r.isConfirmed) {
      setLoading(true, 'กำลังดำเนินการ...');
      callGas('cancelBooking', STATE.token, { bookingId: bookingId, cancelReason: r.value.trim() })
        .then(function() { showToast('ยกเลิกสำเร็จ', 'success'); loadMyBookings(); refreshBadgesImmediately(); })
        .catch(function(e) { showToast(e.message, 'error'); })
        .finally(function() { setLoading(false); });
    }
  });
}

function runBookingSearch() {
  setLoading(true, 'กำลังค้นหา...');
  callGas('searchBookings', STATE.token, { query: document.getElementById('searchQuery').value, roomId: document.getElementById('searchRoom').value, date: document.getElementById('searchDate').value, status: document.getElementById('searchStatus').value })
    .then(function(res) {
      var list = res.data || []; var tbody = document.getElementById('searchResultBody'); if (!tbody) return;
      if (list.length === 0) { tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:var(--muted); padding:16px;">ไม่พบข้อมูล</td></tr>'; return; }
      var html = '';
      list.forEach(function(b) {
        html += '<tr><td><strong>' + escapeHtml(b.BookingID) + '</strong></td><td>' + formatDisplayDateThai(b.Date) + '</td><td>' + escapeHtml(b.StartTime) + '–' + escapeHtml(b.EndTime) + '</td><td>' + escapeHtml(b.RoomName) + '</td><td>' + escapeHtml(b.Topic) + '</td><td>' + escapeHtml(b.BookerName) + '<br><small>' + escapeHtml(b.Department) + '</small></td><td>' + statusBadge(b.EffectiveStatus || b.Status) + '</td><td><button class="btn btn-outline btn-sm" onclick="openBookingDetailModal(\'' + escapeHtml(b.BookingID) + '\')"><i class="bi bi-eye"></i></button></td></tr>';
      });
      tbody.innerHTML = html;
    })
    .catch(function(e) { showToast(e.message, 'error'); })
    .finally(function() { setLoading(false); });
}

function resetBookingSearch() { document.getElementById('searchQuery').value = ''; document.getElementById('searchRoom').value = ''; document.getElementById('searchDate').value = ''; document.getElementById('searchStatus').value = ''; runBookingSearch(); }

function openBookingDetailModal(bookingId) {
  setLoading(true, 'กำลังโหลด...');
  callGas('getBookingById', bookingId)
    .then(function(res) {
      var b = res.data.booking; var qrUrl = window.location.origin + window.location.pathname + '?page=detail&bookingId=' + encodeURIComponent(b.BookingID);
      var modalBody = document.getElementById('detailModalBody'); if (!modalBody) return;
      modalBody.innerHTML = '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;"><strong style="font-size:17px; color:var(--primary);">' + escapeHtml(b.BookingID) + '</strong>' + statusBadge(b.EffectiveStatus || b.Status) + '</div><table style="font-size:14px;"><tr><th style="width:130px;">ห้องประชุม</th><td>' + escapeHtml(b.RoomName) + '</td></tr><tr><th>หัวข้อ</th><td><strong>' + escapeHtml(b.Topic) + '</strong></td></tr><tr><th>วันที่</th><td>' + formatDisplayDateThai(b.Date) + ' (' + escapeHtml(b.StartTime) + '–' + escapeHtml(b.EndTime) + ' น.)</td></tr><tr><th>ผู้จอง</th><td>' + escapeHtml(b.BookerName) + ' (' + escapeHtml(b.Department) + ')</td></tr></table><div style="margin-top:14px; text-align:center;"><button type="button" class="btn btn-outline btn-sm" onclick="downloadBookingPdf(\'' + escapeHtml(b.BookingID) + '\')"><i class="bi bi-file-earmark-pdf-fill" style="color:#dc2626;"></i> พิมพ์ใบขอใช้ห้องประชุม (PDF)</button></div><div class="qr-box" style="margin-top:15px; text-align:center;"><div id="detailQrContainer" style="display:inline-block;"></div></div>';
      openModal('detailModal');
      new QRCode(document.getElementById('detailQrContainer'), { text: qrUrl, width: 130, height: 130, colorDark: '#0f4c81', colorLight: '#ffffff' });
    })
    .catch(function(e) { showToast(e.message, 'error'); })
    .finally(function() { setLoading(false); });
}

function downloadBookingPdf(bookingId) {
  setLoading(true, 'กำลังสร้าง PDF...');
  callGas('generateBookingPdf', STATE.token, bookingId)
    .then(function(res) {
      var link = document.createElement('a'); link.href = res.data.base64; link.download = res.data.fileName;
      document.body.appendChild(link); link.click(); document.body.removeChild(link); showToast('ดาวน์โหลด PDF สำเร็จ', 'success');
    })
    .catch(function(e) { Swal.fire({ icon: 'error', title: 'ไม่สามารถสร้าง PDF', text: e.message, confirmButtonColor: '#0f4c81' }); })
    .finally(function() { setLoading(false); });
}

function loadCalendarEvents() {
  var roomId = document.getElementById('calendarRoomFilter') ? document.getElementById('calendarRoomFilter').value : '';
  setLoading(true, 'กำลังโหลดปฏิทิน...');
  callGas('getCalendarBookings', roomId)
    .then(function(res) {
      var events = res.data || []; var el = document.getElementById('fullCalendarEl'); if (!el) return;
      if (STATE.calendarInstance) STATE.calendarInstance.destroy();
      STATE.calendarInstance = new FullCalendar.Calendar(el, {
        locale: 'th', initialView: window.innerWidth < 640 ? 'listMonth' : 'dayGridMonth', height: 'auto',
        headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay,listMonth' },
        events: events, eventClick: function(info) { if (info.event.extendedProps && info.event.extendedProps.BookingID) openBookingDetailModal(info.event.extendedProps.BookingID); }
      });
      STATE.calendarInstance.render();
    })
    .catch(function(e) { showToast(e.message, 'error'); })
    .finally(function() { setLoading(false); });
}

/* ==========================================================================
 * Auth, GIS, Profile & Admin Settings
 * ======================================================================== */
function openLoginModal() { openModal('loginModal'); }
function switchAuthTab(mode) {
  var tabL = document.getElementById('authTabLogin'); var tabR = document.getElementById('authTabRegister');
  var formL = document.getElementById('loginForm'); var formR = document.getElementById('registerForm');
  if (tabL) tabL.classList.toggle('active', mode === 'login'); if (tabR) tabR.classList.toggle('active', mode === 'register');
  if (formL) formL.style.display = (mode === 'login') ? 'block' : 'none'; if (formR) formR.style.display = (mode === 'register') ? 'block' : 'none';
}

function updateAuthUI() {
  var headerBox = document.getElementById('headerUserBox'); var authBtn = document.getElementById('authActionBtn'); var adminNav = document.getElementById('navAdminBtn');
  if (STATE.user && STATE.user.authenticated) {
    if (headerBox) headerBox.style.display = 'flex'; if (authBtn) authBtn.style.display = 'none';
    var initial = (STATE.user.name || 'U').charAt(0).toUpperCase();
    var avHead = document.getElementById('headerUserAvatar'); if (avHead) avHead.textContent = initial;
    var uName = document.getElementById('headerUserName'); if (uName) uName.textContent = STATE.user.name;
    var uDept = document.getElementById('headerUserDept'); if (uDept) uDept.textContent = STATE.user.department || 'บุคลากร';
    var uRole = document.getElementById('headerUserRole'); if (uRole) { uRole.textContent = STATE.user.role; uRole.className = 'role-badge ' + STATE.user.role; }
    var canAdmin = (['Admin', 'Approver'].indexOf(STATE.user.role) !== -1);
    if (adminNav) adminNav.style.display = canAdmin ? 'flex' : 'none';
    document.querySelectorAll('#navApprovalBtn').forEach(function(el) { el.style.display = canAdmin ? 'flex' : 'none'; });
    document.querySelectorAll('.auth-required-nav').forEach(function(el) { el.style.display = 'flex'; });
    var bkN = document.getElementById('bkName'); if (bkN) bkN.value = STATE.user.name || '';
    var bkE = document.getElementById('bkEmail'); if (bkE) bkE.value = STATE.user.email || '';
    var bkD = document.getElementById('bkDept'); if (bkD && STATE.user.department) bkD.value = STATE.user.department;
    var bkP = document.getElementById('bkPhone'); if (bkP) bkP.value = STATE.user.phone || '';
  } else {
    if (headerBox) headerBox.style.display = 'none'; if (adminNav) adminNav.style.display = 'none';
    document.querySelectorAll('#navApprovalBtn').forEach(function(el) { el.style.display = 'none'; });
    document.querySelectorAll('.auth-required-nav').forEach(function(el) { el.style.display = 'none'; });
    if (authBtn) authBtn.style.display = 'inline-flex';
  }
}

function submitLogin(e) {
  e.preventDefault(); setLoading(true, 'กำลังเข้าสู่ระบบ...');
  callGas('loginWithCredentials', document.getElementById('loginEmail').value.trim(), document.getElementById('loginPass').value.trim())
    .then(function(res) {
      STATE.token = res.data.token; sessionStorage.setItem('MRB_AUTH_TOKEN', STATE.token); STATE.user = res.data.user;
      closeModal('loginModal'); updateAuthUI(); startNotificationPolling(); showToast('เข้าสู่ระบบสำเร็จ', 'success'); navigateTo('dashboard');
    })
    .catch(function(err) { Swal.fire({ icon: 'error', title: 'เข้าสู่ระบบไม่สำเร็จ', text: err.message, confirmButtonColor: '#0f4c81' }); })
    .finally(function() { setLoading(false); });
}

function submitRegister(e) {
  e.preventDefault(); setLoading(true, 'กำลังลงทะเบียน...');
  callGas('registerStaffAccount', { name: document.getElementById('regName').value.trim(), department: document.getElementById('regDept').value, phone: document.getElementById('regPhone').value.trim(), email: document.getElementById('regEmail').value.trim(), passcode: document.getElementById('regPass').value.trim() })
    .then(function(res) { closeModal('loginModal'); Swal.fire({ icon: 'success', title: 'ลงทะเบียนสำเร็จ', text: res.message, confirmButtonColor: '#0f4c81' }); })
    .catch(function(err) { Swal.fire({ icon: 'error', title: 'ลงทะเบียนไม่สำเร็จ', text: err.message, confirmButtonColor: '#0f4c81' }); })
    .finally(function() { setLoading(false); });
}

function handleLogout() {
  setLoading(true, 'กำลังออกจากระบบ...');
  callGas('logoutSession', STATE.token).catch(function() {}).finally(function() {
    sessionStorage.removeItem('MRB_AUTH_TOKEN'); STATE.token = '';
    STATE.user = { authenticated: false, role: 'Guest', email: '', name: '', department: '', phone: '', googleLinked: false };
    stopNotificationPolling(); updateAuthUI(); setLoading(false); navigateTo('dashboard');
  });
}

function initGoogleIdentityServices() {
  if (typeof google === 'undefined' || !GOOGLE_CLIENT_ID) return;
  try {
    google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: handleGoogleSignInCallback });
    var btn = document.getElementById('googleSignInBtn'); if (btn) google.accounts.id.renderButton(btn, { theme: 'outline', size: 'large', shape: 'pill', width: 300 });
  } catch (e) {}
}

function handleGoogleSignInCallback(response) {
  if (!response || !response.credential) return;
  setLoading(true, 'กำลังตรวจสอบ Google Account...');
  callGas('loginWithGoogle', { idToken: response.credential })
    .then(function(res) {
      STATE.token = res.data.token; sessionStorage.setItem('MRB_AUTH_TOKEN', STATE.token); STATE.user = res.data.user;
      closeModal('loginModal'); updateAuthUI(); startNotificationPolling(); showToast('เข้าสู่ระบบสำเร็จ', 'success'); navigateTo('dashboard');
    })
    .catch(function(err) { Swal.fire({ icon: 'info', title: 'แจ้งสถานะ', text: err.message, confirmButtonColor: '#0f4c81' }); })
    .finally(function() { setLoading(false); });
}

function openProfileModal() {
  if (!STATE.user || !STATE.user.authenticated) { openLoginModal(); return; }
  document.getElementById('profEmail').value = STATE.user.email || ''; document.getElementById('profName').value = STATE.user.name || '';
  document.getElementById('profPhone').value = STATE.user.phone || ''; document.getElementById('profPass').value = '';
  openModal('profileModal');
}

function submitProfileUpdate(e) {
  e.preventDefault(); setLoading(true, 'กำลังบันทึก...');
  callGas('updateUserProfile', STATE.token, { name: document.getElementById('profName').value.trim(), department: document.getElementById('profDept').value, phone: document.getElementById('profPhone').value.trim(), passcode: document.getElementById('profPass').value.trim() })
    .then(function(res) { STATE.user.name = res.data.name; STATE.user.department = res.data.department; STATE.user.phone = res.data.phone; updateAuthUI(); closeModal('profileModal'); showToast('อัปเดตโปรไฟล์สำเร็จ', 'success'); })
    .catch(function(e) { showToast(e.message, 'error'); })
    .finally(function() { setLoading(false); });
}

function switchAdminTab(tabName, btnElement) {
  document.querySelectorAll('#view-admin .tab-btn').forEach(function(b) { b.classList.remove('active', 'btn-primary'); b.classList.add('btn-outline'); });
  if (btnElement) { btnElement.classList.add('active', 'btn-primary'); btnElement.classList.remove('btn-outline'); }
  document.querySelectorAll('#view-admin .tab-panel').forEach(function(p) { p.style.display = 'none'; });
  var target = document.getElementById('admin-tab-' + tabName); if (target) target.style.display = 'block';
  if (tabName === 'approval' || tabName === 'allbookings') loadAdminBookings();
  else if (tabName === 'rooms') loadAdminRooms();
  else if (tabName === 'users') loadAdminUsers();
  else if (tabName === 'settings') loadAdminSettings();
  else if (tabName === 'audit') loadAdminAudit();
}

function loadAdminView() { switchAdminTab('approval', document.querySelector('#view-admin .tab-btn')); }
function loadAdminBookings() {} function loadAdminRooms() {} function loadAdminUsers() {} function loadAdminAudit() {}

function loadAdminSettings() {
  callGas('getAdminSettings', STATE.token)
    .then(function(res) {
      var s = res.data || {};
      document.getElementById('setOrgName').value = s.ORG_NAME || '';
      if (document.getElementById('setFrontendUrl')) document.getElementById('setFrontendUrl').value = s.FRONTEND_URL || '';
      document.getElementById('setOpenHour').value = extractCleanTime(s.OPEN_HOUR, '07:00');
      document.getElementById('setCloseHour').value = extractCleanTime(s.CLOSE_HOUR, '20:00');
      if (document.getElementById('setKioskMaxUpcoming')) document.getElementById('setKioskMaxUpcoming').value = s.KIOSK_MAX_UPCOMING || '5';
    })
    .catch(function(err) { showToast(err.message, 'error'); });
}

function submitAdminSettings(e) {
  e.preventDefault(); setLoading(true, 'กำลังบันทึกการตั้งค่า...');
  function getSafeVal(id, def) { var el = document.getElementById(id); return (el && el.value !== undefined) ? el.value.trim() : (def || ''); }

  var payload = {
    ORG_NAME: getSafeVal('setOrgName', 'เทศบาลเมืองสมุทรสงคราม'),
    FRONTEND_URL: getSafeVal('setFrontendUrl', ''),
    OPEN_HOUR: getSafeVal('setOpenHour', '07:00'),
    CLOSE_HOUR: getSafeVal('setCloseHour', '20:00'),
    KIOSK_MAX_UPCOMING: getSafeVal('setKioskMaxUpcoming', '5')
  };

  callGas('saveAdminSettings', STATE.token, payload)
    .then(function() {
      STATE.settings = payload; var org = document.getElementById('orgNameLabel'); if (org) org.textContent = payload.ORG_NAME;
      Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ', timer: 1800, showConfirmButton: false });
    })
    .catch(function(err) { Swal.fire({ icon: 'error', title: 'บันทึกไม่สำเร็จ', text: err.message, confirmButtonColor: '#0f4c81' }); })
    .finally(function() { setLoading(false); });
}
