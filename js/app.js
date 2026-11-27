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

/* ==========================================================================
 * Global State & Default Layouts
 * ======================================================================== */
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
 * Fetch API Bridge (เชื่อมต่อ Google Apps Script doPost API)
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
 * SweetAlert2 & Utility Helpers
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

function todayIso() {
  var d = new Date();
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}

function formatDisplayDateThai(dateStr) {
  if (!dateStr) return '-';
  var clean = String(dateStr).substring(0, 10);
  var p = clean.split('-');
  if (p.length !== 3) return clean;
  var months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  return parseInt(p[2], 10) + ' ' + (months[parseInt(p[1], 10) - 1] || '') + ' ' + (parseInt(p[0], 10) + 543);
}

function timeToMinutes(hhmm) {
  var p = String(hhmm).split(':');
  return (p.length < 2) ? -1 : (parseInt(p[0], 10) * 60 + parseInt(p[1], 10));
}

function minutesToTime(mins) {
  return ('0' + Math.floor(mins / 60)).slice(-2) + ':' + ('0' + (mins % 60)).slice(-2);
}

function extractCleanTime(val, defaultTime) {
  var m = String(val || '').match(/(\d{1,2}):(\d{2})/);
  return m ? (('0' + parseInt(m[1], 10)).slice(-2) + ':' + ('0' + parseInt(m[2], 10)).slice(-2)) : (defaultTime || '07:00');
}

function ensureTimeOptionExists(selectEl, timeVal) {
  if (!selectEl || !timeVal) return;
  for (var i = 0; i < selectEl.options.length; i++) {
    if (selectEl.options[i].value === timeVal) return;
  }
  var opt = document.createElement('option');
  opt.value = timeVal; opt.textContent = timeVal + ' น.';
  selectEl.appendChild(opt);
}

/* ==========================================================================
 * Bootstrap & App Initialization
 * ======================================================================== */
document.addEventListener('DOMContentLoaded', function() {
  var urlParams = new URLSearchParams(window.location.search);
  window.APP_BOOT = {
    initialPage: urlParams.get('page') || 'dashboard',
    initialBookingId: urlParams.get('bookingId') || ''
  };

  STATE.token = sessionStorage.getItem('MRB_AUTH_TOKEN') || '';
  localStorage.removeItem('MRB_AUTH_TOKEN');

  bootstrapApp().then(function() {
    if (window.APP_BOOT.initialBookingId) {
      openBookingDetailModal(window.APP_BOOT.initialBookingId);
    }
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
        initModernThaiCalendar('availCheckDate', function(selectedDate) {
          handleDateSelectionChange(selectedDate, 'availCheckDate');
        });
        initModernThaiCalendar('bkDate', function(selectedDate) {
          syncDateFromForm();
        });
        initModernThaiCalendar('searchDate', function(selectedDate) {
          runBookingSearch();
        });
      }

      updateTimeSlotOptions();
      startNotificationPolling();

      if (typeof initGoogleIdentityServices === 'function') {
        setTimeout(initGoogleIdentityServices, 300);
      }

      var targetView = (window.APP_BOOT && window.APP_BOOT.initialPage && document.getElementById('view-' + window.APP_BOOT.initialPage))
        ? window.APP_BOOT.initialPage : 'dashboard';
      navigateTo(targetView);
    })
    .catch(function(err) {
      Swal.fire({ icon: 'error', title: 'เชื่อมต่อระบบไม่สำเร็จ', text: err.message, confirmButtonColor: '#0f4c81' });
    })
    .finally(function() { setLoading(false); });
}
/* ==========================================================================
 * Navigation (รองรับ Kiosk Mode เต็มจอ)
 * ======================================================================== */
function navigateTo(view) {
  var restrictedViews = ['calendar', 'mybookings', 'stats', 'booking'];
  if (restrictedViews.indexOf(view) !== -1 && !STATE.user.authenticated) {
    Swal.fire({
      icon: 'info', title: 'ต้องเข้าสู่ระบบก่อน', text: 'กรุณาเข้าสู่ระบบบุคลากรเพื่อใช้งานส่วนนี้', confirmButtonColor: '#0f4c81'
    }).then(function() { openLoginModal(); });
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
  views.forEach(function(v) { v.classList.remove('active'); if(v.id === 'view-kiosk') v.style.display = 'none'; });

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

function fetchNotificationBadgesSilent(isInitial) {
  if (!STATE.user.authenticated) return;
  if (['Admin', 'Approver'].indexOf(STATE.user.role) !== -1) {
    callGas('getNotificationBadges', STATE.token)
      .then(function(res) {
        var data = res.data || { pendingBookings: 0, pendingUsers: 0, latestCancelled: null };
        updatePendingBadgeCount(Number(data.pendingBookings) || 0);
        if (STATE.user.role === 'Admin') updateAdminPendingBadge(Number(data.pendingUsers) || 0);
      }).catch(function() {});
  }

  callGas('searchBookings', STATE.token, { myOnly: true, userEmail: STATE.user.email })
    .then(function(res) {
      var list = res.data || [];
      var pendingCount = list.filter(function(x) {
        var st = x.EffectiveStatus || x.Status;
        return st === 'รออนุมัติ';
      }).length;
      updateMyBookingsBadge(pendingCount);
      checkBookerStatusUpdates(list);
    }).catch(function() {});
}

function updatePendingBadgeCount(c) { var b = document.getElementById('sidebarPendingBadge'); if(b){ b.textContent=c; b.style.display=c>0?'inline-block':'none'; } }
function updateAdminPendingBadge(c) { var b = document.getElementById('sidebarAdminBadge'); if(b){ b.textContent=c; b.style.display=c>0?'inline-block':'none'; } }
function updateMyBookingsBadge(c) { var b = document.getElementById('sidebarMyBookingsBadge'); if(b){ b.textContent=c; b.style.display=c>0?'inline-block':'none'; } }

function checkBookerStatusUpdates(bookingsList) {
  if (!STATE.user || !STATE.user.authenticated) return;
  var storageKey = 'KNOWN_BOOKING_STATUS_' + STATE.user.email.toLowerCase();
  var knownStatuses = {};
  try { knownStatuses = JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch (e) { knownStatuses = {}; }

  var statusChanged = false;
  var approvedBooking = null;

  bookingsList.forEach(function(b) {
    var id = b.BookingID;
    var currentStatus = b.EffectiveStatus || b.Status;
    var prevStatus = knownStatuses[id];
    if (prevStatus && prevStatus !== currentStatus) statusChanged = true;
    if (prevStatus === 'รออนุมัติ' && currentStatus === 'อนุมัติ') approvedBooking = b;
    knownStatuses[id] = currentStatus;
  });

  localStorage.setItem(storageKey, JSON.stringify(knownStatuses));

  if (statusChanged) {
    var myView = document.getElementById('view-mybookings');
    if (myView && myView.classList.contains('active') && typeof loadMyBookings === 'function') loadMyBookings();
  }

  if (approvedBooking) {
    Swal.fire({
      icon: 'success', title: '🎉 การจองห้องได้รับการอนุมัติแล้ว!',
      html: 'รายการ <strong>' + escapeHtml(approvedBooking.Topic) + '</strong> (' + escapeHtml(approvedBooking.RoomName) + ') ได้รับการอนุมัติแล้ว',
      confirmButtonColor: '#16a34a', confirmButtonText: 'ดูรายละเอียด'
    }).then(function() {
      if (typeof loadMyBookings === 'function') loadMyBookings();
      openBookingDetailModal(approvedBooking.BookingID);
    });
  }
}

/* ==========================================================================
 * Time Slots, Room Availability & Kiosk
 * ======================================================================== */
function updateTimeSlotOptions() {
  var startSelect = document.getElementById('bkStart');
  var endSelect = document.getElementById('bkEnd');
  var dateInput = document.getElementById('bkDate');
  if (!startSelect || !endSelect || !dateInput) return;

  var selectedDate = dateInput.value;
  var isToday = (selectedDate === todayIso());
  var openMin = timeToMinutes(extractCleanTime(STATE.settings.OPEN_HOUR, '07:00'));
  var closeMin = timeToMinutes(extractCleanTime(STATE.settings.CLOSE_HOUR, '20:00'));
  var nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();

  var startOptions = '';
  var firstValidStart = null;
  var prevStart = startSelect.value;

  for (var m = openMin; m < closeMin; m += 30) {
    if (isToday && m <= nowMinutes) continue;
    var timeStr = minutesToTime(m);
    if (!firstValidStart) firstValidStart = timeStr;
    startOptions += '<option value="' + timeStr + '" ' + (timeStr === prevStart ? 'selected' : '') + '>' + timeStr + ' น.</option>';
  }

  startSelect.innerHTML = startOptions || '<option value="">-- ไม่สามารถจองได้ --</option>';
  if (!startSelect.value) startSelect.value = firstValidStart;
  rebuildEndTimeOptions();
}

function rebuildEndTimeOptions() {
  var startSelect = document.getElementById('bkStart');
  var endSelect = document.getElementById('bkEnd');
  if (!startSelect || !endSelect || !startSelect.value) return;

  var startMin = timeToMinutes(startSelect.value);
  var closeMin = timeToMinutes(extractCleanTime(STATE.settings.CLOSE_HOUR, '20:00'));
  var endOptions = '';
  var prevEnd = endSelect.value;

  for (var m = startMin + 30; m <= closeMin; m += 30) {
    var timeStr = minutesToTime(m);
    endOptions += '<option value="' + timeStr + '" ' + (timeStr === prevEnd ? 'selected' : '') + '>' + timeStr + ' น.</option>';
  }
  endSelect.innerHTML = endOptions;
  updateDurationBadge();
}

function updateDurationBadge() {
  var startEl = document.getElementById('bkStart'), endEl = document.getElementById('bkEnd'), badge = document.getElementById('bookingDurationText');
  if (!badge || !startEl || !endEl || !startEl.value || !endEl.value) return;
  var diff = timeToMinutes(endEl.value) - timeToMinutes(startEl.value);
  if (diff <= 0) { badge.textContent = 'เวลาไม่ถูกต้อง'; badge.style.color = '#dc2626'; return; }
  var h = Math.floor(diff / 60), m = diff % 60;
  badge.textContent = 'รวม ' + (h > 0 ? h + ' ชม. ' : '') + (m > 0 ? m + ' นาที' : '');
  badge.style.color = '#166534';
}

function applyTimePreset(startTime, endTime) {
  var startSelect = document.getElementById('bkStart'), endSelect = document.getElementById('bkEnd');
  ensureTimeOptionExists(startSelect, startTime); startSelect.value = startTime;
  rebuildEndTimeOptions();
  ensureTimeOptionExists(endSelect, endTime); endSelect.value = endTime;
  updateDurationBadge();
  triggerAutoCheckAvailability();
}

var autoCheckTimer = null;
function triggerAutoCheckAvailability() {
  if (autoCheckTimer) clearTimeout(autoCheckTimer);
  autoCheckTimer = setTimeout(performLiveAvailabilityCheck, 350);
}

function performLiveAvailabilityCheck() {
  var roomId = document.getElementById('bkRoomId').value;
  var date = document.getElementById('bkDate').value;
  var startTime = document.getElementById('bkStart').value;
  var endTime = document.getElementById('bkEnd').value;
  var banner = document.getElementById('liveAvailStatusBox');
  if (!banner || !roomId || !date || !startTime || !endTime) return;

  callGas('checkRoomAvailability', { roomId: roomId, date: date, startTime: startTime, endTime: endTime })
    .then(function(res) {
      var avail = res.data;
      if (avail.available) {
        banner.innerHTML = '<div style="background:#f0fdf4; border:1px solid #bbf7d0; border-left:5px solid #16a34a; padding:12px; border-radius:8px; color:#166534;"><i class="bi bi-check-circle-fill"></i> <strong>ห้องว่าง พร้อมจอง!</strong> (' + startTime + ' - ' + endTime + ' น.)</div>';
      } else {
        var html = '<div style="background:#fef2f2; border:1px solid #fecaca; border-left:5px solid #dc2626; padding:12px; border-radius:8px; color:#991b1b;">ห้องไม่ว่างในช่วงเวลานี้';
        if (avail.suggestedSlots && avail.suggestedSlots.length > 0) {
          html += '<div style="margin-top:6px;">ช่วงเวลาใกล้เคียง: ';
          avail.suggestedSlots.forEach(function(s) {
            html += '<span style="background:#fff; border:1px solid #fca5a5; padding:2px 6px; border-radius:4px; margin-right:4px; cursor:pointer;" onclick="applyTimePreset(\'' + s.startTime + '\',\'' + s.endTime + '\')">' + s.startTime + '-' + s.endTime + '</span>';
          });
          html += '</div>';
        }
        html += '</div>';
        banner.innerHTML = html;
      }
    }).catch(function(err) { banner.innerHTML = 'ตรวจสอบไม่ได้: ' + escapeHtml(err.message); });
}

function handleDateSelectionChange(selectedDate) {
  if (!selectedDate) return;
  var availInput = document.getElementById('availCheckDate'), bkInput = document.getElementById('bkDate');
  if (availInput) availInput.value = selectedDate;
  if (bkInput) bkInput.value = selectedDate;
  updateTimeSlotOptions();
  fetchAndRenderRoomAvailability(selectedDate);
}

function syncDateFromForm() { var bk = document.getElementById('bkDate'); if (bk && bk.value) handleDateSelectionChange(bk.value); }

function fetchAndRenderRoomAvailability(dateVal) {
  var container = document.getElementById('roomAvailCards');
  if (!container) return;
  container.innerHTML = 'กำลังโหลดสถานะห้อง...';
  callGas('getRoomAvailabilityForDate', dateVal)
    .then(function(res) {
      var rooms = res.data.rooms || [];
      var html = '';
      rooms.forEach(function(r) {
        var isFree = (r.statusType === 'FREE');
        html += '<div class="avail-item" onclick="selectRoomFromAvail(\'' + r.RoomID + '\')"><strong>' + escapeHtml(r.RoomName) + '</strong><br><span class="' + (isFree ? 'avail-free' : 'avail-busy') + '">' + (isFree ? '🟢 ว่างทั้งวัน' : '🔴 มีช่วงไม่ว่าง') + '</span></div>';
      });
      container.innerHTML = html;
    }).catch(function(err) { container.innerHTML = 'Error: ' + err.message; });
}

function selectRoomFromAvail(roomId) {
  var sel = document.getElementById('bkRoomId');
  if (sel) sel.value = roomId;
  triggerAutoCheckAvailability();
}

/* ==========================================================================
 * Kiosk Mode Functions
 * ======================================================================== */
var kioskTimer = null, kioskClockTimer = null;
function startKioskMode() {
  enterFullscreen(); loadKioskData();
  if (!kioskTimer) kioskTimer = setInterval(loadKioskData, 30000);
  if (!kioskClockTimer) kioskClockTimer = setInterval(updateKioskClock, 1000);
}
function stopKioskMode() {
  if (kioskTimer) { clearInterval(kioskTimer); kioskTimer = null; }
  if (kioskClockTimer) { clearInterval(kioskClockTimer); kioskClockTimer = null; }
  exitFullscreen();
}
function enterFullscreen() { var el = document.documentElement; if(el.requestFullscreen) el.requestFullscreen().catch(function(){}); }
function exitFullscreen() { if(document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function(){}); }
function updateKioskClock() {
  var now = new Date();
  var c = document.getElementById('kioskClock'), d = document.getElementById('kioskDate');
  if (c) c.textContent = now.toTimeString().split(' ')[0];
  if (d) d.textContent = formatDisplayDateThai(todayIso());
}
function loadKioskData() {
  callGas('getKioskRoomStatus').then(function(res) {
    var data = res.data, grid = document.getElementById('kioskRoomGrid');
    if (!grid) return;
    var html = '';
    data.rooms.forEach(function(r) {
      var isBusy = (r.status === 'BUSY');
      html += '<div style="background:#1e293b; border:2px solid ' + (isBusy ? '#ef4444' : '#10b981') + '; border-radius:16px; padding:16px; color:#fff;">' +
        '<h3 style="color:#fff; margin-bottom:8px;">' + escapeHtml(r.roomName) + '</h3>' +
        '<div>' + (isBusy && r.currentMeeting ? '🔴 กำลังประชุม: ' + escapeHtml(r.currentMeeting.Topic) : '🟢 ห้องว่างพร้อมใช้งาน') + '</div>' +
        '</div>';
    });
    grid.innerHTML = html;
  }).catch(function(err) { console.error('Kiosk Error:', err); });
}

/* ==========================================================================
 * Admin Settings, Users & Tables
 * ======================================================================== */
function switchAdminTab(tabName, btnElement) {
  document.querySelectorAll('#view-admin .tab-btn').forEach(function(b) { b.classList.remove('active', 'btn-primary'); b.classList.add('btn-outline'); });
  if (btnElement) { btnElement.classList.add('active', 'btn-primary'); btnElement.classList.remove('btn-outline'); }
  document.querySelectorAll('#view-admin .tab-panel').forEach(function(p) { p.style.display = 'none'; });
  var target = document.getElementById('admin-tab-' + tabName);
  if (target) target.style.display = 'block';
  if (tabName === 'settings' && typeof loadAdminSettings === 'function') loadAdminSettings();
}

function loadAdminView() { switchAdminTab('approval', document.querySelector('#view-admin .tab-btn')); }
function loadAdminBookings() {}
function loadAdminRooms() {}
function loadAdminUsers() {}

function loadAdminSettings() {
  callGas('getAdminSettings', STATE.token)
    .then(function(res) {
      var s = res.data || {};
      var org = document.getElementById('setOrgName'); if(org) org.value = s.ORG_NAME || '';
      var url = document.getElementById('setFrontendUrl'); if(url) url.value = s.FRONTEND_URL || '';
      var op = document.getElementById('setOpenHour'); if(op) op.value = extractCleanTime(s.OPEN_HOUR, '07:00');
      var cl = document.getElementById('setCloseHour'); if(cl) cl.value = extractCleanTime(s.CLOSE_HOUR, '20:00');
      var km = document.getElementById('setKioskMaxUpcoming'); if(km) km.value = s.KIOSK_MAX_UPCOMING || '5';
    }).catch(function(err) { showToast(err.message, 'error'); });
}

function submitAdminSettings(e) {
  e.preventDefault();
  setLoading(true, 'กำลังบันทึก...');
  function getSafeVal(id, def) { var el = document.getElementById(id); return (el && el.value !== undefined) ? el.value.trim() : (def || ''); }

  var payload = {
    ORG_NAME: getSafeVal('setOrgName', 'เทศบาลเมืองสมุทรสงคราม'),
    FRONTEND_URL: getSafeVal('setFrontendUrl', ''),
    OPEN_HOUR: getSafeVal('setOpenHour', '07:00'),
    CLOSE_HOUR: getSafeVal('setCloseHour', '20:00'),
    KIOSK_MAX_UPCOMING: getSafeVal('setKioskMaxUpcoming', '5'),
    REQUIRE_APPROVAL: getSafeVal('setRequireApproval', 'TRUE'),
    ENABLE_CALENDAR_SYNC: getSafeVal('setCalendarSync', 'TRUE'),
    ENABLE_CHAT_NOTIFY: getSafeVal('setChatNotify', 'FALSE'),
    REMINDER_1D: getSafeVal('setRemind1D', 'TRUE'),
    REMINDER_2H: getSafeVal('setRemind2H', 'TRUE'),
    REMINDER_30M: getSafeVal('setRemind30M', 'TRUE')
  };

  callGas('saveAdminSettings', STATE.token, payload)
    .then(function() {
      STATE.settings = payload;
      var orgLabel = document.getElementById('orgNameLabel');
      if (orgLabel) orgLabel.textContent = payload.ORG_NAME;
      Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ!', text: 'บันทึกการตั้งค่าเรียบร้อยแล้ว', confirmButtonColor: '#0f4c81', timer: 2000 });
    })
    .catch(function(err) { Swal.fire({ icon: 'error', title: 'ไม่สำเร็จ', text: err.message, confirmButtonColor: '#0f4c81' }); })
    .finally(function() { setLoading(false); });
}
/* ==========================================================================
 * Admin Management: Audit Logs, Rooms & Users Modals
 * ======================================================================== */

function loadAdminAudit() {
  setLoading(true, 'กำลังโหลดประวัติระบบ...');
  callGas('getAuditLogs', STATE.token, 100)
    .then(function(res) {
      var list = res.data || [];
      var tbody = document.getElementById('adminAuditBody');
      if (!tbody) return;

      if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--muted); padding:16px;">ไม่พบประวัติการใช้งานระบบ</td></tr>';
        return;
      }

      var html = '';
      list.forEach(function(l) {
        html += '<tr>' +
          '<td style="white-space:nowrap;">' + escapeHtml(l.Timestamp) + '</td>' +
          '<td>' + escapeHtml(l.UserEmail) + '</td>' +
          '<td>' + escapeHtml(l.Role) + '</td>' +
          '<td><strong>' + escapeHtml(l.Action) + '</strong></td>' +
          '<td>' + escapeHtml(l.TargetID) + '</td>' +
          '<td>' + escapeHtml(l.Details) + '</td>' +
          '</tr>';
      });
      tbody.innerHTML = html;
    })
    .catch(function(err) { showToast(err.message, 'error'); })
    .finally(function() { setLoading(false); });
}

function openRoomModal(roomId) {
  STATE.pendingRoomImage = null;
  var form = document.getElementById('roomForm');
  if (form) form.reset();
  
  var previewWrap = document.getElementById('rmPreviewWrap');
  if (previewWrap) previewWrap.style.display = 'none';

  if (roomId && window._adminRoomsCache) {
    var r = window._adminRoomsCache.find(function(x) { return x.RoomID === roomId; });
    if (r) {
      document.getElementById('roomModalTitle').textContent = 'แก้ไขห้องประชุม: ' + r.RoomName;
      document.getElementById('rmId').value = r.RoomID;
      document.getElementById('rmName').value = r.RoomName;
      document.getElementById('rmBuilding').value = r.Building;
      document.getElementById('rmFloor').value = r.Floor;
      document.getElementById('rmCapacity').value = r.Capacity;
      document.getElementById('rmStatus').value = r.Status;
      document.getElementById('rmResponsible').value = r.Responsible || '';
      document.getElementById('rmColor').value = r.Color || '#0284c7';
      document.getElementById('rmEquipment').value = r.Equipment || '';
      document.getElementById('rmDesc').value = r.Description || '';
      document.getElementById('rmImageUrl').value = r.ImageURL || '';
      if (r.ImageURL && typeof updateRoomImagePreview === 'function') {
        updateRoomImagePreview(r.ImageURL);
      }
    }
  } else {
    var titleEl = document.getElementById('roomModalTitle');
    if (titleEl) titleEl.textContent = 'เพิ่มห้องประชุมใหม่';
    var idEl = document.getElementById('rmId');
    if (idEl) idEl.value = '';
  }
  openModal('roomModal');
}

function openUserModal(email) {
  var userForm = document.getElementById('userForm');
  if (userForm) userForm.reset();
  
  var emailInput = document.getElementById('usrEmail');
  if (emailInput) emailInput.readOnly = Boolean(email);

  if (email && window._adminUsersCache) {
    var u = window._adminUsersCache.find(function(x) { return x.Email === email; });
    if (u) {
      if (emailInput) emailInput.value = u.Email;
      var nameEl = document.getElementById('usrName'); if (nameEl) nameEl.value = u.Name || '';
      var deptEl = document.getElementById('usrDept'); if (deptEl) deptEl.value = u.Department || '';
      var roleEl = document.getElementById('usrRole'); if (roleEl) roleEl.value = u.Role || 'User';
      var statusEl = document.getElementById('usrStatus'); if (statusEl) statusEl.value = u.Status || 'Active';
      var phoneEl = document.getElementById('usrPhone'); if (phoneEl) phoneEl.value = u.Phone || '';
    }
  }
  openModal('userModal');
}
