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
  token: sessionStorage.getItem('MRB_AUTH_TOKEN') || '', // ปิด Auto-login ข้ามเบราว์เซอร์
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
  {
    id: "theater",
    name: "แบบเธียเตอร์ (Theater)",
    desc: "จัดเก้าอี้แถวเรียง ไม่ใช้โต๊ะเขียน เหมาะกับการฟังบรรยาย สัมมนา จุคนได้สูงสุด",
    diagramUrl: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=600&q=80",
    photoUrl: "https://images.unsplash.com/photo-1517502884422-41eaead166d4?auto=format&fit=crop&w=800&q=80"
  },
  {
    id: "classroom",
    name: "แบบชั้นเรียน (Classroom)",
    desc: "จัดโต๊ะและเก้าอี้แถวเรียง มีพื้นที่วางเอกสารและโน้ตบุ๊ก เหมาะสำหรับการฝึกอบรม",
    diagramUrl: "https://images.unsplash.com/photo-1580582932707-520aed937b7b?auto=format&fit=crop&w=600&q=80",
    photoUrl: "https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=800&q=80"
  },
  {
    id: "ushape",
    name: "แบบตัวยู (U-Shape)",
    desc: "จัดโต๊ะรูปตัว U ผู้เข้าร่วมสบตากันได้ทั่วถึง เหมาะกับการประชุมหารือ และสัมภาษณ์",
    diagramUrl: "https://images.unsplash.com/photo-1577412647305-991150c7d163?auto=format&fit=crop&w=600&q=80",
    photoUrl: "https://images.unsplash.com/photo-1505373877841-8d25f7d46678?auto=format&fit=crop&w=800&q=80"
  },
  {
    id: "boardroom",
    name: "แบบโต๊ะประชุมกลาง (Boardroom)",
    desc: "โต๊ะประชุมตัวใหญ่ตัวเดียวล้อมรอบ เหมาะกับการประชุมคณะผู้บริหาร หัวหน้าส่วนราชการ",
    diagramUrl: "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=600&q=80",
    photoUrl: "https://images.unsplash.com/photo-1517502884422-41eaead166d4?auto=format&fit=crop&w=800&q=80"
  },
  {
    id: "banquet",
    name: "แบบกลุ่มเวิร์กช็อป (Round Table)",
    desc: "จัดแบบโต๊ะกลม หรือกลุ่มย่อย เหมาะกับการประชุมเชิงปฏิบัติการ ระดมสมองเป็นทีม",
    diagramUrl: "https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&w=600&q=80",
    photoUrl: "https://images.unsplash.com/photo-1528605248644-14dd04022da1?auto=format&fit=crop&w=800&q=80"
  }
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
    // getInitialAppData, logoutSession, getDashboardData, getUsersList, getAdminSettings, getNotificationBadges
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
    if (!response.ok) {
      throw new Error('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ (HTTP ' + response.status + ')');
    }
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
/**
 * เปิดใช้งานปฏิทิน Flatpickr สไตล์ Modern รองรับภาษาไทยและปี พ.ศ.
 */
function initModernThaiCalendar(elementId, onSelectCallback) {
  var el = document.getElementById(elementId);
  if (!el || typeof flatpickr === 'undefined') return;

  flatpickr(el, {
    locale: 'th', // ใช้ภาษาไทย
    dateFormat: 'Y-m-d', // ค่าเบื้องหลังเก็บเป็น ค.ศ. (YYYY-MM-DD) เพื่อส่งให้ระบบ Database
    altInput: true, // เปิดใช้ช่องแสดงผลจำลอง
    altFormat: 'j M Y', // รูปแบบการแสดงผล เช่น 27 พ.ย. 2569 (แปลง ค.ศ. เป็น พ.ศ. ด้านล่าง)
    minDate: 'today',
    disableMobile: "true", // บังคับใช้ปฏิทินสวยงามของเว็บแทนปฏิทินมือถือเดิม
    onChange: function(selectedDates, dateStr, instance) {
      // แปลงปี ค.ศ. บนช่องแสดงผลเป็นปี พ.ศ. อัตโนมัติทันที
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
      if (typeof onSelectCallback === 'function') {
        onSelectCallback(dateStr);
      }
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
      toast: true,
      position: 'top-end',
      showConfirmButton: false,
      timer: 3500,
      timerProgressBar: true,
      didOpen: function(toast) {
        toast.onmouseenter = Swal.stopTimer;
        toast.onmouseleave = Swal.resumeTimer;
      }
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
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function initThaiDatePicker(elementId, onSelectCallback) {
    if (typeof jQuery === 'undefined' || !jQuery().datepicker) return;

    jQuery('#' + elementId).datepicker({
      dateFormat: 'yy-mm-dd', // ค่าเบื้องหลังเก็บเป็น ค.ศ. (YYYY-MM-DD) เพื่อส่งให้ระบบ Database
      altField: '#' + elementId + '_display', // ช่องจำลองแสดงผล พ.ศ.
      altFormat: 'dd M yy',
      dayNamesMin: ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'],
      monthNames: ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'],
      monthNamesShort: ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'],
      onSelect: function(dateText) {
        if (typeof onSelectCallback === 'function') {
          onSelectCallback(dateText);
        }
      },
      beforeShowDay: function(date) {
        return [true, ''];
      }
    });

    // แปลงปี ค.ศ. เป็น พ.ศ. บนปฏิทิน
    jQuery('#' + elementId).datepicker('option', 'yearSuffix', ' ');
    jQuery('#' + elementId).datepicker('option', 'beforeShow', function(input, inst) {
      setTimeout(function() {
        // ปรับแต่งปี พ.ศ. บนหัวปฏิทิน
        var yearText = inst.dpDiv.find('.ui-datepicker-year').text();
        if (yearText && parseInt(yearText, 10) < 2400) {
          inst.dpDiv.find('.ui-datepicker-year').text(parseInt(yearText, 10) + 543);
        }
      }, 10);
    });
  }
function openModal(id) {
  var el = document.getElementById(id);
  if (el) el.classList.add('show');
}

function closeModal(id) {
  var el = document.getElementById(id);
  if (el) el.classList.remove('show');
}

function toggleSidebar(open) {
  var sb = document.getElementById('sidebar');
  var ov = document.getElementById('sidebarOverlay');
  if (sb) sb.classList.toggle('open', Boolean(open));
  if (ov) ov.classList.toggle('show', Boolean(open));
}

function statusBadge(status) {
  var map = {
    'รออนุมัติ': 'badge-pending',
    'อนุมัติ': 'badge-approved',
    'ไม่อนุมัติ': 'badge-rejected',
    'ยกเลิก': 'badge-cancelled',
    'เสร็จสิ้น': 'badge-completed'
  };
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
  opt.value = timeVal;
  opt.textContent = timeVal + ' น.';
  selectEl.appendChild(opt);
}

/* ==========================================================================
 * Bootstrap, Dropdowns & Navigation
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

/**
 * เริ่มต้นระบบและโหลดข้อมูลตั้งต้นทั้งหมดเข้าสู่แอปพลิเคชัน
 */
/**
 * เริ่มต้นระบบและโหลดข้อมูลตั้งต้นทั้งหมดเข้าสู่แอปพลิเคชัน
 */
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

      // อัปเดตชื่อหน่วยงานบนหัวแถบเมนู
      var orgLabel = document.getElementById('orgNameLabel');
      if (orgLabel) {
        orgLabel.textContent = STATE.settings.ORG_NAME || 'เทศบาลเมืองสมุทรสงคราม';
      }

      // 1. เติมตัวเลือกใน Dropdowns ทั้งหมด
      populateDropdowns();

      // 2. เรนเดอร์การ์ดรูปแบบการจัดโต๊ะเก้าอี้ห้องประชุม
      renderBookingLayoutCards();

      // 3. อัปเดตสถานะผู้ใช้งาน (แสดง/ซ่อน เมนูตามสิทธิ์)
      updateAuthUI();

      // 4. ตั้งค่าวันที่เริ่มต้นสำหรับช่องเลือกวัน (วันนี้เป็นต้นไป)
      var today = todayIso();
      ['availCheckDate', 'bkDate', 'searchDate'].forEach(function(id) {
        var input = document.getElementById(id);
        if (input && !input.value) {
          input.value = (id === 'searchDate' ? '' : today); // ช่องค้นหาปล่อยว่างเพื่อให้ค้นหาทั้งหมดได้
          if (id !== 'searchDate') input.min = today;
        }
      });

      // 5. เปิดใช้งานปฏิทิน Flatpickr สไตล์ Modern (ภาษาไทยและปี พ.ศ.)
      if (typeof initModernThaiCalendar === 'function') {
        // ปฏิทินเช็คห้องว่างหน้าจอง (ด้านบน)
        initModernThaiCalendar('availCheckDate', function(selectedDate) {
          handleDateSelectionChange(selectedDate, 'availCheckDate');
        });

        // ปฏิทินวันที่ในฟอร์มจอง (ด้านล่าง)
        initModernThaiCalendar('bkDate', function(selectedDate) {
          syncDateFromForm();
        });

        // ปฏิทินค้นหาในหน้าสถิติและค้นหา (view-stats)
        initModernThaiCalendar('searchDate', function(selectedDate) {
          runBookingSearch();
        });
      }

      // 6. สร้างตัวเลือกเวลาเริ่มต้น-สิ้นสุด (กรองเวลาในอดีตทิ้งอัตโนมัติหากเป็นวันนี้)
      updateTimeSlotOptions();

      // 7. เริ่มต้นระบบ Polling ตรวจสอบตัวเลข Badge แจ้งเตือน Real-time เบื้องหลัง
      startNotificationPolling();

      // 8. เริ่มต้นปุ่มเข้าสู่ระบบด้วย Google Account (GIS)
      if (typeof initGoogleIdentityServices === 'function') {
        setTimeout(initGoogleIdentityServices, 300);
      }

      // 9. นำทางไปยังหน้าเป้าหมายเริ่มต้น (หรือเปิดรายละเอียดจาก QR Code)
      var targetView = (window.APP_BOOT && window.APP_BOOT.initialPage && document.getElementById('view-' + window.APP_BOOT.initialPage))
        ? window.APP_BOOT.initialPage : 'dashboard';
      navigateTo(targetView);
    })
    .catch(function(err) {
      Swal.fire({
        icon: 'error',
        title: 'เชื่อมต่อระบบไม่สำเร็จ',
        text: err.message,
        confirmButtonColor: '#0f4c81',
        confirmButtonText: 'ลองใหม่อีกครั้ง'
      });
    })
    .finally(function() {
      setLoading(false);
    });
}
/**
 * ฟังก์ชันกลางสำหรับจัดการเมื่อมีการเปลี่ยนวันที่จากช่องใดช่องหนึ่ง
 */
function handleDateSelectionChange(selectedDate, sourceId) {
  if (!selectedDate) return;

  // 1. ซิงค์ค่าวันที่ระหว่างช่องด้านบน (availCheckDate) และด้านล่าง (bkDate) ให้ตรงกันเสมอ
  var availInput = document.getElementById('availCheckDate');
  var bkInput = document.getElementById('bkDate');

  if (availInput && availInput.value !== selectedDate) {
    availInput.value = selectedDate;
    if (availInput._flatpickr) availInput._flatpickr.setDate(selectedDate, false);
  }
  if (bkInput && bkInput.value !== selectedDate) {
    bkInput.value = selectedDate;
    if (bkInput._flatpickr) bkInput._flatpickr.setDate(selectedDate, false);
  }

  // 2. ล้างกล่องแจ้งเตือนสถานะการจองเดิมทิ้ง
  var chkBox = document.getElementById('availabilityCheckBox');
  if (chkBox) chkBox.innerHTML = '';

  // 3. บังคับปลดล็อกปุ่ม Preset ทั้งหมดทันที (เปิดปุ่มเต็มวัน/เช้า/บ่ายให้กดได้)
  var presets = document.querySelectorAll('.time-preset-btn');
  presets.forEach(function(btn) {
    btn.disabled = false;
    btn.style.opacity = '1';
    btn.style.cursor = 'pointer';
    btn.style.pointerEvents = 'auto';
  });

  // 4. อัปเดตตัวเลือกสล็อตเวลา (Time Slots)
  updateTimeSlotOptions();

  // 5. [หัวใจสำคัญ] สั่งดึงสถานะห้องว่างรายวันใหม่จากฐานข้อมูลเพื่ออัปเดตการ์ดด้านบนและสถานะห้อง
  fetchAndRenderRoomAvailability(selectedDate);
}

// ฟังก์ชันเดิมรองรับการเรียกใช้แบบเดิม
function syncDateFromForm() {
  var bkInput = document.getElementById('bkDate');
  if (bkInput && bkInput.value) {
    handleDateSelectionChange(bkInput.value, 'bkDate');
  }
}

function onBookingDateChanged() {
  var availInput = document.getElementById('availCheckDate');
  if (availInput && availInput.value) {
    handleDateSelectionChange(availInput.value, 'availCheckDate');
  }
}

/**
 * ฟังก์ชันดึงข้อมูลห้องว่างรายวันและเรนเดอร์การ์ดแสดงผลด้านบน
 */
function fetchAndRenderRoomAvailability(dateVal) {
  var container = document.getElementById('roomAvailCards');
  if (!container) return;
  
  container.innerHTML = '<div style="color:var(--muted); padding:10px 0;"><i class="bi bi-arrow-repeat spin"></i> กำลังตรวจสอบสถานะห้องประชุมประจำวัน...</div>';

  callGas('getRoomAvailabilityForDate', dateVal)
    .then(function(res) {
      var rooms = res.data.rooms || [];
      var currentSelected = document.getElementById('bkRoomId').value;

      var html = '';
      rooms.forEach(function(r) {
        var isFree = (r.statusType === 'FREE');
        var dot = isFree ? '🟢' : '🔴';
        var statusCls = isFree ? 'avail-free' : 'avail-busy';
        var selectedCls = (r.RoomID === currentSelected) ? 'selected' : '';

        var statusHtml = '';
        if (isFree) {
          statusHtml = '— ว่างทั้งวัน';
        } else if (r.statusType === 'FULL') {
          statusHtml = '— <span style="color:#dc2626; font-weight:600;">ไม่ว่างทั้งวัน</span>';
          if (r.bookedSlots && r.bookedSlots.length > 0) {
            statusHtml += '<div style="margin-top:4px; font-size:12.5px; color:#475569;">';
            r.bookedSlots.forEach(function(s) {
              statusHtml += '<div>• ช่วงเวลา ' + s.startTime + ' - ' + s.endTime + ' น. (' + escapeHtml(s.topic) + ')</div>';
            });
            statusHtml += '</div>';
          }
        } else {
          statusHtml = '— <span style="color:#d97706; font-weight:600;">มีช่วงเวลาที่ไม่ว่าง:</span>';
          if (r.bookedSlots && r.bookedSlots.length > 0) {
            statusHtml += '<div style="margin-top:4px; font-size:12.5px; color:#475569;">';
            r.bookedSlots.forEach(function(s) {
              statusHtml += '<div>🔴 ถูกจอง ' + s.startTime + ' - ' + s.endTime + ' น. (' + escapeHtml(s.topic) + ')</div>';
            });
            statusHtml += '</div>';
          }
        }

        html += '<div class="avail-item ' + selectedCls + '" data-room-id="' + escapeHtml(r.RoomID) + '" onclick="selectRoomFromAvail(\'' + escapeHtml(r.RoomID) + '\')">' +
          '<div style="display:flex; justify-content:space-between; align-items:center;">' +
          '<strong>' + escapeHtml(r.RoomName) + '</strong>' +
          '<small style="color:var(--muted);">ความจุ ' + r.Capacity + ' คน</small>' +
          '</div>' +
          '<div class="avail-status ' + statusCls + '" style="margin-top:6px;">' + dot + ' ' + statusHtml + '</div>' +
          '</div>';
      });
      container.innerHTML = html;
    })
    .catch(function(err) {
      container.innerHTML = '<div class="alert alert-danger">ไม่สามารถโหลดสถานะห้องว่างได้: ' + escapeHtml(err.message) + '</div>';
    });
}
function populateDropdowns() {
  var deptHtml = '<option value="">-- เลือกหน่วยงาน (กอง/สำนัก) --</option>';
  STATE.departments.forEach(function(d) {
    deptHtml += '<option value="' + escapeHtml(d) + '">' + escapeHtml(d) + '</option>';
  });

  ['bkDept', 'regDept', 'usrDept', 'profDept'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.innerHTML = deptHtml;
  });

  var roomOpts = '<option value="">-- เลือกห้องประชุม --</option>';
  STATE.rooms.forEach(function(r) {
    roomOpts += '<option value="' + escapeHtml(r.RoomID) + '">' + escapeHtml(r.RoomName) + ' (จุ ' + r.Capacity + ' คน)</option>';
  });
  var bkRoom = document.getElementById('bkRoomId');
  if (bkRoom) bkRoom.innerHTML = roomOpts;

  var filterOpts = '<option value="">ทุกห้องประชุม</option>';
  STATE.rooms.forEach(function(r) {
    filterOpts += '<option value="' + escapeHtml(r.RoomID) + '">' + escapeHtml(r.RoomName) + '</option>';
  });
  ['searchRoom', 'calendarRoomFilter'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.innerHTML = filterOpts;
  });
}
/* ==========================================================================
 * Navigation (ปรับปรุงล่าสุด รองรับ Kiosk Mode)
 * ======================================================================== */
function navigateTo(view) {
  var restrictedViews = ['calendar', 'mybookings', 'stats', 'booking'];
  if (restrictedViews.indexOf(view) !== -1 && !STATE.user.authenticated) {
    Swal.fire({
      icon: 'info',
      title: 'ต้องเข้าสู่ระบบก่อน',
      text: 'กรุณาเข้าสู่ระบบบุคลากรเพื่อใช้งานส่วนนี้',
      confirmButtonColor: '#0f4c81',
      confirmButtonText: 'เข้าสู่ระบบ / ลงทะเบียน'
    }).then(function() {
      openLoginModal();
    });
    return;
  }

  if ((view === 'approval' || view === 'admin') && ['Admin', 'Approver'].indexOf(STATE.user.role) === -1) {
    Swal.fire({
      icon: 'warning',
      title: 'ไม่มีสิทธิ์เข้าถึง',
      text: 'หน้านี้สงวนสิทธิ์เฉพาะผู้ดูแลระบบ (Admin) หรือผู้อนุมัติ (Approver) เท่านั้น',
      confirmButtonColor: '#0f4c81'
    });
    return;
  }

  var isKiosk = (view === 'kiosk');
  
  // 🟢 ค้นหา Layout หลักของเว็บเพื่อซ่อนเมื่ออยู่โหมด Kiosk
  var sidebar = document.getElementById('sidebar');
  var sidebarOverlay = document.getElementById('sidebarOverlay');
  var mainHeaderBar = document.querySelector('.app-header') || document.querySelector('header');
  var mainLayoutContent = document.querySelector('.app-main') || document.querySelector('.main-content');

  if (isKiosk) {
    stopNotificationPolling();
    startKioskMode();
    
    // ซ่อนเลย์เอาต์หลักทั้งหมด
    if (sidebar) sidebar.style.display = 'none';
    if (sidebarOverlay) sidebarOverlay.style.display = 'none';
    if (mainHeaderBar) mainHeaderBar.style.display = 'none';
    if (mainLayoutContent) mainLayoutContent.style.marginLeft = '0';
  } else {
    stopKioskMode();
    
    // คืนค่าเลย์เอาต์หลักกลับมา
    if (sidebar) sidebar.style.display = '';
    if (sidebarOverlay) sidebarOverlay.style.display = '';
    if (mainHeaderBar) mainHeaderBar.style.display = '';
    if (mainLayoutContent) mainLayoutContent.style.marginLeft = '';

    if (STATE.user && STATE.user.authenticated) {
      startNotificationPolling();
    }
  }

  var views = document.querySelectorAll('.app-view');
  views.forEach(function(v) { 
    v.classList.remove('active'); 
    if(v.id === 'view-kiosk') v.style.display = 'none'; // ซ่อน view อื่นๆ รวมทั้ง kiosk ถ้าไม่ได้เรียก
  });

  var target = document.getElementById('view-' + view);
  if (target) {
    target.classList.add('active');
    if (isKiosk) target.style.display = 'block'; // แสดงผล Kiosk แบบเต็มจอ
  }

  var btns = document.querySelectorAll('.nav-item, .mobile-bottom-btn');
  btns.forEach(function(b) {
    b.classList.toggle('active', b.getAttribute('data-view') === view);
  });

  var titles = {
    dashboard: 'Dashboard ภาพรวมระบบ',
    booking: 'จองห้องประชุมออนไลน์',
    approval: 'อนุมัติการจองห้องประชุม',
    calendar: 'ตารางการใช้ห้องประชุม',
    rooms: 'ข้อมูลห้องประชุมทั้งหมด',
    mybookings: 'รายการจองของฉัน',
    stats: 'สถิติและค้นหารายการจอง',
    admin: 'จัดการระบบและอนุมัติการจอง',
    kiosk: 'ระบบแสดงสถานะห้องประชุมหน้าห้อง (Kiosk)'
  };
  var pageTitle = document.getElementById('pageTitle');
  if (pageTitle) pageTitle.textContent = titles[view] || 'ระบบจองห้องประชุม';

  toggleSidebar(false);

  if (view === 'dashboard') loadDashboard();
  else if (view === 'booking') onBookingDateChanged();
  else if (view === 'approval') loadApprovalViewData();
  else if (view === 'calendar') loadCalendarEvents();
  else if (view === 'rooms') renderRoomsDirectory();
  else if (view === 'mybookings') loadMyBookings();
  else if (view === 'stats') runBookingSearch();
  else if (view === 'admin') loadAdminView();
  else if (view === 'kiosk') loadKioskData();
}
/* ==========================================================================
 * Kiosk Mode Management (Full Screen & Auto Refresh)
 * ======================================================================== */
var kioskTimer = null;
var kioskClockTimer = null;

function startKioskMode() {
  // 1. สั่งเปิดใช้งานโหมด Full Screen ของเบราว์เซอร์อัตโนมัติ
  enterFullscreen();

  // 2. โหลดข้อมูลรอบแรก
  loadKioskData();
  
  // 3. ตั้งเวลาอัปเดตข้อมูลห้องประชุมทุกๆ 30 วินาที
  if (!kioskTimer) {
    kioskTimer = setInterval(loadKioskData, 30000);
  }
  
  // 4. ตั้งเวลานาฬิกาดิจิทัลทุกๆ 1 วินาที
  if (!kioskClockTimer) {
    kioskClockTimer = setInterval(updateKioskClock, 1000);
  }
}

function stopKioskMode() {
  // เคลียร์ Timer ต่างๆ
  if (kioskTimer) {
    clearInterval(kioskTimer);
    kioskTimer = null;
  }
  if (kioskClockTimer) {
    clearInterval(kioskClockTimer);
    kioskClockTimer = null;
  }

  // ออกจากโหมด Full Screen ของเบราว์เซอร์
  exitFullscreen();
}

/**
 * ฟังก์ชันสั่งให้หน้าจอเบราว์เซอร์ขยายเป็นแบบ Fullscreen แท้
 */
function enterFullscreen() {
  var elem = document.documentElement;
  if (elem.requestFullscreen) {
    elem.requestFullscreen().catch(function(err) {
      console.log("Browser prevented automatic fullscreen:", err);
    });
  } else if (elem.webkitRequestFullscreen) { /* Safari */
    elem.webkitRequestFullscreen();
  } else if (elem.msRequestFullscreen) { /* IE11 */
    elem.msRequestFullscreen();
  }
}

/**
 * ฟังก์ชันสั่งออกจาก Fullscreen
 */
function exitFullscreen() {
  if (document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement) {
    if (document.exitFullscreen) {
      document.exitFullscreen().catch(function(err) {
        console.log("Exit fullscreen error:", err);
      });
    } else if (document.webkitExitFullscreen) { /* Safari */
      document.webkitExitFullscreen();
    } else if (document.msExitFullscreen) { /* IE11 */
      document.msExitFullscreen();
    }
  }
}

function updateKioskClock() {
  var now = new Date();
  var clockEl = document.getElementById('kioskClock');
  var dateEl = document.getElementById('kioskDate');
  if (clockEl) clockEl.textContent = now.toTimeString().split(' ')[0];
  if (dateEl) dateEl.textContent = formatDisplayDateThai(todayIso());
}

function loadKioskData() {
  callGas('getKioskRoomStatus')
    .then(function(res) {
      var data = res.data;
      var grid = document.getElementById('kioskRoomGrid');
      if (!grid) return;

      var html = '';
      data.rooms.forEach(function(r) {
        var isBusy = (r.status === 'BUSY');
        var isMaint = (r.status === 'MAINTENANCE');
        
        var cardBg = isBusy ? '#7f1d1d' : (isMaint ? '#475569' : '#065f46');
        var statusText = isBusy ? 'กำลังใช้งาน (BUSY)' : (isMaint ? 'ปิดปรับปรุง' : 'ห้องว่าง (AVAILABLE)');
        var statusDot = isBusy ? '🔴' : (isMaint ? '🟡' : '🟢');

        html += '<div style="background: #1e293b; border: 2px solid ' + (isBusy ? '#ef4444' : (isMaint ? '#94a3b8' : '#10b981')) + '; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.3); display: flex; flex-direction: column;">' +
          // รูปภาพและป้ายสถานะด้านบน
          '<div style="position: relative; height: 150px; background: #334155; flex-shrink: 0;">' +
            '<img src="' + escapeHtml(r.image || 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=800') + '" style="width: 100%; height: 100%; object-fit: cover; opacity: 0.75;">' +
            '<div style="position: absolute; top: 12px; right: 12px; background: ' + cardBg + '; color: #fff; padding: 6px 14px; border-radius: 20px; font-weight: 700; font-size: 13px; box-shadow: 0 4px 6px rgba(0,0,0,0.2);">' +
              statusDot + ' ' + statusText +
            '</div>' +
            '<div style="position: absolute; bottom: 0; left: 0; right: 0; background: linear-gradient(to top, rgba(15,23,42,0.95), transparent); padding: 15px 15px 8px 15px;">' +
              '<h3 style="margin: 0; font-size: 19px; color: #fff; font-weight: 700;">' + escapeHtml(r.roomName) + '</h3>' +
              '<div style="font-size: 12px; color: #94a3b8;"><i class="bi bi-geo-alt"></i> ' + escapeHtml(r.building) + ' ' + escapeHtml(r.floor) + ' &bull; ความจุ ' + r.capacity + ' คน</div>' +
            '</div>' +
          '</div>' +
          
          // รายละเอียดการประชุมปัจจุบัน
          '<div style="padding: 16px; flex-grow: 1; display: flex; flex-direction: column;">';

        if (isBusy && r.currentMeeting) {
          var m = r.currentMeeting;
          html += '<div style="background: rgba(239, 68, 68, 0.15); border-left: 4px solid #ef4444; padding: 10px; border-radius: 0 8px 8px 0; margin-bottom: 12px; flex-shrink: 0;">' +
            '<div style="font-size: 11px; color: #f87171; font-weight: 700; text-transform: uppercase;">กำลังประชุมขณะนี้</div>' +
            '<div style="font-size: 15px; font-weight: 700; color: #fff; margin: 2px 0;">' + escapeHtml(m.Topic) + '</div>' +
            '<div style="font-size: 12.5px; color: #cbd5e1;"><i class="bi bi-clock"></i> ' + escapeHtml(m.StartTime) + ' - ' + escapeHtml(m.EndTime) + ' น.</div>' +
            '<div style="font-size: 12px; color: #94a3b8; margin-top: 4px;"><i class="bi bi-person"></i> ผู้จอง: ' + escapeHtml(m.BookerName) + ' (' + escapeHtml(m.Department) + ')</div>' +
          '</div>';
        } else {
          html += '<div style="background: rgba(16, 185, 129, 0.1); border-left: 4px solid #10b981; padding: 10px; border-radius: 0 8px 8px 0; margin-bottom: 12px; color: #34d399; font-weight: 600; flex-shrink: 0;">' +
            '<i class="bi bi-check-circle"></i> ห้องว่างพร้อมใช้งานในขณะนี้' +
          '</div>';
        }

        // แสดงรายการจองถัดไป (สูงสุด 5 รายการ)
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
    .catch(function(err) {
      console.error('Kiosk Load Error:', err);
    });
}
/* ==========================================================================
 * Real-time Background Polling & Booker Status Notifications
 * ======================================================================== */
var POLL_INTERVAL_MS = 15000; // เช็กอัปเดตเบื้องหลังทุก 15 วินาที

function refreshBadgesImmediately() {
  if (!STATE.user.authenticated) return;
  fetchNotificationBadgesSilent(false);
}

function startNotificationPolling() {
  stopNotificationPolling();
  if (!STATE.user.authenticated) return;

  fetchNotificationBadgesSilent(true);

  STATE.pollTimer = setInterval(function() {
    if (!document.hidden) {
      fetchNotificationBadgesSilent(false);
    }
  }, POLL_INTERVAL_MS);
}

function stopNotificationPolling() {
  if (STATE.pollTimer) {
    clearInterval(STATE.pollTimer);
    STATE.pollTimer = null;
  }
  STATE.lastBadgeBookings = null;
  STATE.lastBadgeUsers = null;
  document.title = 'ระบบจองห้องประชุมออนไลน์ | เทศบาลเมืองสมุทรสงคราม';
}

document.addEventListener('visibilitychange', function() {
  if (!document.hidden && STATE.user.authenticated) {
    fetchNotificationBadgesSilent(false);
  }
});

function fetchNotificationBadgesSilent(isInitial) {
  if (!STATE.user.authenticated) return;

  // 1. สำหรับ Admin / Approver: อัปเดต Badge คำขอรออนุมัติและผู้สมัครใหม่
  if (['Admin', 'Approver'].indexOf(STATE.user.role) !== -1) {
    callGas('getNotificationBadges', STATE.token)
      .then(function(res) {
        var data = res.data || { pendingBookings: 0, pendingUsers: 0, latestCancelled: null };
        var newBookings = Number(data.pendingBookings) || 0;
        var newUsers = Number(data.pendingUsers) || 0;

        updatePendingBadgeCount(newBookings);
        if (STATE.user.role === 'Admin') {
          updateAdminPendingBadge(newUsers);
        }

        var totalAlert = newBookings + (STATE.user.role === 'Admin' ? newUsers : 0);
        document.title = (totalAlert > 0 ? '(' + totalAlert + ') ' : '') + 'ระบบจองห้องประชุมออนไลน์ | เทศบาลเมืองสมุทรสงคราม';

        // 🔔 ตรวจจับการยกเลิกการจองเพื่อเด้ง Popup แจ้งเตือน Admin / Approver ทันที
        if (data.latestCancelled) {
          var cancelObj = data.latestCancelled;
          var cancelKey = cancelObj.bookingId + '_' + cancelObj.cancelDate;
          var lastAckCancel = localStorage.getItem('LAST_ACK_CANCEL_KEY') || '';

          if (isInitial) {
            if (!lastAckCancel) {
              localStorage.setItem('LAST_ACK_CANCEL_KEY', cancelKey);
            }
          } else if (cancelKey !== lastAckCancel) {
            localStorage.setItem('LAST_ACK_CANCEL_KEY', cancelKey);

            Swal.fire({
              icon: 'warning',
              title: '⚠️ มีการยกเลิกการจองห้องประชุม!',
              html: '<div style="text-align:left; font-size:14px; line-height:1.6;">' +
                    'รหัสการจอง: <strong>' + escapeHtml(cancelObj.bookingId) + '</strong><br>' +
                    'ห้องประชุม: <strong>' + escapeHtml(cancelObj.roomName) + '</strong><br>' +
                    'หัวข้อ: <strong>' + escapeHtml(cancelObj.topic) + '</strong><br>' +
                    'วันที่ใช้งาน: ' + formatDisplayDateThai(cancelObj.date) + '<br>' +
                    'ผู้จอง: ' + escapeHtml(cancelObj.bookerName) + ' (' + escapeHtml(cancelObj.department) + ')<br>' +
                    '<div style="margin-top:10px; padding:10px; background:#fef2f2; border:1px solid #fecaca; border-radius:8px; color:#991b1b; font-size:13px;">' +
                    '<strong>เหตุผลการยกเลิก:</strong> ' + escapeHtml(cancelObj.cancelReason || 'ไม่ระบุ') + '</div>' +
                    '</div>',
              confirmButtonColor: '#0f4c81',
              confirmButtonText: 'รับทราบ'
            });

            refreshActiveViews();
            if (typeof loadCalendarEvents === 'function' && document.getElementById('view-calendar').classList.contains('active')) {
              loadCalendarEvents();
            }
          }
        }

        if (!isInitial) {
          if (STATE.lastBadgeBookings !== null && newBookings > STATE.lastBadgeBookings) {
            var diffB = newBookings - STATE.lastBadgeBookings;
            showToast('🔔 มีรายการจองห้องประชุมใหม่รออนุมัติ (+' + diffB + ' รายการ)', 'info');
            refreshActiveViews();
          }
          if (STATE.user.role === 'Admin' && STATE.lastBadgeUsers !== null && newUsers > STATE.lastBadgeUsers) {
            var diffU = newUsers - STATE.lastBadgeUsers;
            showToast('👤 มีผู้ลงทะเบียนใหม่รออนุมัติ (+' + diffU + ' บัญชี)', 'warning');
            refreshActiveUsersTab();
          }
        } else if (STATE.user.role === 'Admin' && newUsers > 0) {
          Swal.fire({
            icon: 'info',
            title: 'มีผู้ลงทะเบียนใหม่รออนุมัติบัญชี',
            text: 'พบสมาชิกใหม่ ' + newUsers + ' บัญชี ที่กำลังรอการตรวจสอบและอนุมัติการใช้งาน',
            confirmButtonColor: '#0f4c81',
            confirmButtonText: '<i class="bi bi-people"></i> ไปที่หน้าจัดการผู้ใช้',
            showCancelButton: true,
            cancelButtonText: 'ภายหลัง'
          }).then(function(rs) {
            if (rs.isConfirmed) {
              navigateTo('admin');
              setTimeout(function() {
                var usersTabBtn = document.querySelectorAll('#view-admin .tab-btn')[3];
                if (usersTabBtn) switchAdminTab('users', usersTabBtn);
              }, 200);
            }
          });
        }

        STATE.lastBadgeBookings = newBookings;
        STATE.lastBadgeUsers = newUsers;
      })
      .catch(function() {});
  }

  // 2. สำหรับบุคลากรทุกคน: อัปเดต Badge รายการจองของฉัน และตรวจจับผลอนุมัติ
  callGas('searchBookings', STATE.token, { myOnly: true, userEmail: STATE.user.email })
    .then(function(res) {
      var list = res.data || [];
      var activeCount = list.filter(function(x) {
        var st = x.EffectiveStatus || x.Status;
        return st === 'รออนุมัติ' || st === 'อนุมัติ';
      }).length;
      updateMyBookingsBadge(activeCount);
      checkBookerStatusUpdates(list);
    })
    .catch(function() {});
}

function updatePendingBadgeCount(count) {
  var badge = document.getElementById('sidebarPendingBadge');
  if (!badge) return;
  var num = Number(count) || 0;
  badge.textContent = num;
  badge.style.display = num > 0 ? 'inline-block' : 'none';
}

function updateAdminPendingBadge(count) {
  var badge = document.getElementById('sidebarAdminBadge');
  if (!badge) return;
  var num = Number(count) || 0;
  badge.textContent = num;
  badge.style.display = num > 0 ? 'inline-block' : 'none';
}

function updateMyBookingsBadge(count) {
  var badge = document.getElementById('sidebarMyBookingsBadge');
  if (!badge) return;
  var num = Number(count) || 0;
  badge.textContent = num;
  badge.style.display = num > 0 ? 'inline-block' : 'none';
}

function refreshActiveViews() {
  var approvalView = document.getElementById('view-approval');
  var dashView = document.getElementById('view-dashboard');
  var adminView = document.getElementById('view-admin');
  var calView = document.getElementById('view-calendar');

  if (approvalView && approvalView.classList.contains('active')) loadApprovalViewData();
  if (dashView && dashView.classList.contains('active')) loadDashboard();
  if (adminView && adminView.classList.contains('active')) loadAdminBookings();
  
  // อัปเดตตารางปฏิทินทันทีหากเปิดหน้านั้นอยู่ หรือดึงข้อมูลใหม่
  if (calView && calView.classList.contains('active')) {
    loadCalendarEvents();
  }
}

function refreshActiveUsersTab() {
  var usersPanel = document.getElementById('admin-tab-users');
  var adminView = document.getElementById('view-admin');
  if (adminView && adminView.classList.contains('active') && usersPanel && usersPanel.classList.contains('active')) {
    loadAdminUsers();
  }
}

function checkBookerStatusUpdates(bookingsList) {
  if (!STATE.user || !STATE.user.authenticated) return;
  var storageKey = 'KNOWN_BOOKING_STATUS_' + STATE.user.email.toLowerCase();
  var knownStatuses = {};
  try {
    knownStatuses = JSON.parse(localStorage.getItem(storageKey) || '{}');
  } catch (e) { knownStatuses = {}; }

  var hasNewApproval = false;
  var hasNewRejection = false;
  var approvedBooking = null;
  var rejectedBooking = null;
  var statusChanged = false; // 🟢 ตัวแปรเช็กว่ามีการเปลี่ยนแปลงสถานะหรือไม่

  bookingsList.forEach(function(b) {
    var id = b.BookingID;
    var currentStatus = b.EffectiveStatus || b.Status;
    var prevStatus = knownStatuses[id];

    // ถ้าในระบบเคยบันทึกสถานะไว้ และสถานะปัจจุบันเปลี่ยนไปจากเดิม
    if (prevStatus && prevStatus !== currentStatus) {
      statusChanged = true;
    }

    if (prevStatus === 'รออนุมัติ') {
      if (currentStatus === 'อนุมัติ' && !hasNewApproval) {
        hasNewApproval = true;
        approvedBooking = b;
      } else if (currentStatus === 'ไม่อนุมัติ' && !hasNewRejection) {
        hasNewRejection = true;
        rejectedBooking = b;
      }
    }
    knownStatuses[id] = currentStatus;
  });

  localStorage.setItem(storageKey, JSON.stringify(knownStatuses));

  // 🟢 หากสถานะมีการเปลี่ยนแปลง และผู้ใช้อยู่หน้า "รายการจองของฉัน" ให้รีเฟรชตารางและ Badge ทันที
  if (statusChanged) {
    var myBookingsView = document.getElementById('view-mybookings');
    if (myBookingsView && myBookingsView.classList.contains('active')) {
      if (typeof loadMyBookings === 'function') {
        loadMyBookings();
      }
    }
    // อัปเดตตัวเลข Active Count บน Badge เมนูซ้าย
    var activeCount = bookingsList.filter(function(x) {
      var st = x.EffectiveStatus || x.Status;
      return st === 'รออนุมัติ' || st === 'อนุมัติ';
    }).length;
    updateMyBookingsBadge(activeCount);
  }

  if (hasNewApproval && approvedBooking) {
    Swal.fire({
      icon: 'success',
      title: '🎉 การจองห้องได้รับการอนุมัติแล้ว!',
      html: 'รายการจอง <strong>' + escapeHtml(approvedBooking.Topic) + '</strong> (' + escapeHtml(approvedBooking.RoomName) + ')<br>วันที่ ' + formatDisplayDateThai(approvedBooking.Date) + ' ได้รับการอนุมัติแล้ว พร้อมใช้งานตามกำหนดเวลา',
      confirmButtonColor: '#16a34a',
      confirmButtonText: '<i class="bi bi-qr-code"></i> ดูรายละเอียด & QR Code'
    }).then(function() {
      // เมื่อกดปิด Pop-up หรือกดดูรายละเอียด ให้รีเฟรชตารางอีกรอบเพื่อความชัวร์
      if (typeof loadMyBookings === 'function') loadMyBookings();
      openBookingDetailModal(approvedBooking.BookingID);
    });
  } else if (hasNewRejection && rejectedBooking) {
    Swal.fire({
      icon: 'warning',
      title: 'แจ้งผล: การจองไม่ได้รับการอนุมัติ',
      html: 'รายการจอง <strong>' + escapeHtml(rejectedBooking.Topic) + '</strong> (' + escapeHtml(rejectedBooking.RoomName) + ')<br>วันที่ ' + formatDisplayDateThai(rejectedBooking.Date) + ' ไม่ผ่านการอนุมัติ กรุณาตรวจสอบหรือเลือกช่วงเวลาใหม่',
      confirmButtonColor: '#0f4c81',
      confirmButtonText: 'รับทราบ'
    }).then(function() {
      if (typeof loadMyBookings === 'function') loadMyBookings();
    });
  }
}
/* ==========================================================================
 * Dynamic Time Slot Generation & Real-time Availability Checking
 * ======================================================================== */
function updateTimeSlotOptions() {
    var startSelect = document.getElementById('bkStart');
    var endSelect = document.getElementById('bkEnd');
    var dateInput = document.getElementById('bkDate');
    if (!startSelect || !endSelect || !dateInput) return;

    var selectedDate = dateInput.value;
    var today = todayIso();
    var isToday = (selectedDate === today);

    var openTime = extractCleanTime(STATE.settings.OPEN_HOUR, '07:00');
    var closeTime = extractCleanTime(STATE.settings.CLOSE_HOUR, '20:00');
    var openMin = timeToMinutes(openTime);
    var closeMin = timeToMinutes(closeTime);

    var now = new Date();
    var nowMinutes = now.getHours() * 60 + now.getMinutes();

    var startOptions = '';
    var validStartCount = 0;
    var firstValidStart = null;
    var previousStartVal = startSelect.value;

    for (var m = openMin; m < closeMin; m += 30) {
      // 🟢 กรองเวลาในอดีตออกเฉพาะเมื่อเป็น "วันนี้" เท่านั้น (ถ้าเป็นวันในอนาคต แสดงทั้งหมด)
      if (isToday && m <= nowMinutes) {
        continue;
      }

      var timeStr = minutesToTime(m);
      if (!firstValidStart) firstValidStart = timeStr;
      validStartCount++;

      var sel = (timeStr === previousStartVal) ? 'selected' : '';
      startOptions += '<option value="' + timeStr + '" ' + sel + '>' + timeStr + ' น.</option>';
    }

    if (validStartCount === 0 && isToday) {
      startSelect.innerHTML = '<option value="">-- หมดเวลาจองสำหรับวันนี้ --</option>';
      endSelect.innerHTML = '<option value="">-- ไม่สามารถจองได้ --</option>';
      disableTimePresets(true);
      updateDurationBadge();
      triggerAutoCheckAvailability();
      return;
    }

    startSelect.innerHTML = startOptions;
    
    var hasPrev = false;
    for (var i = 0; i < startSelect.options.length; i++) {
      if (startSelect.options[i].value === previousStartVal) { hasPrev = true; break; }
    }
    startSelect.value = hasPrev ? previousStartVal : firstValidStart;

    rebuildEndTimeOptions();
    
    // 🟢 สั่งอัปเดตสถานะปุ่ม Preset โดยส่งค่า isToday เข้าไปตรวจสอบ
    disablePastPresetButtons(isToday, nowMinutes);
  }

  function disablePastPresetButtons(isToday, nowMinutes) {
    var presets = document.querySelectorAll('.time-preset-btn');
    
    // 🟢 กฎเหล็ก: ถ้าไม่ใช่ "วันนี้" (เช่น เป็นวันในอนาคตที่เลือก) บังคับเปิดใช้งานปุ่มลัดทั้งหมดทันที 100% ห้ามเป็นสีเทา
    if (!isToday) {
      presets.forEach(function(btn) {
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
        btn.style.pointerEvents = 'auto';
      });
      return;
    }

    // 🟡 ถ้าเป็น "วันนี้" จึงค่อยเช็กเงื่อนไขเวลาปัจจุบันตามปกติ
    if (presets[0]) {
      var pastMorning = (nowMinutes >= timeToMinutes('12:00'));
      presets[0].disabled = pastMorning;
      presets[0].style.opacity = pastMorning ? '0.35' : '1';
      presets[0].style.cursor = pastMorning ? 'not-allowed' : 'pointer';
    }
    if (presets[1]) {
      var pastAfternoon = (nowMinutes >= timeToMinutes('16:30'));
      presets[1].disabled = pastAfternoon;
      presets[1].style.opacity = pastAfternoon ? '0.35' : '1';
      presets[1].style.cursor = pastAfternoon ? 'not-allowed' : 'pointer';
    }
    if (presets[2]) {
      var pastAllDay = (nowMinutes >= timeToMinutes('08:30'));
      presets[2].disabled = pastAllDay;
      presets[2].style.opacity = pastAllDay ? '0.35' : '1';
      presets[2].style.cursor = pastAllDay ? 'not-allowed' : 'pointer';
    }
  }

function rebuildEndTimeOptions() {
  var startSelect = document.getElementById('bkStart');
  var endSelect = document.getElementById('bkEnd');
  if (!startSelect || !endSelect) return;

  var startTime = startSelect.value;
  if (!startTime) {
    endSelect.innerHTML = '<option value="">-- เลือกเวลาเริ่มก่อน --</option>';
    return;
  }

  var startMin = timeToMinutes(startTime);
  var closeTime = extractCleanTime(STATE.settings.CLOSE_HOUR, '20:00');
  var closeMin = timeToMinutes(closeTime);

  var endOptions = '';
  var previousEndVal = endSelect.value;

  for (var m = startMin + 30; m <= closeMin; m += 30) {
    var timeStr = minutesToTime(m);
    var sel = (timeStr === previousEndVal) ? 'selected' : '';
    endOptions += '<option value="' + timeStr + '" ' + sel + '>' + timeStr + ' น.</option>';
  }

  endSelect.innerHTML = endOptions;
  var hasPrevEnd = false;
  for (var j = 0; j < endSelect.options.length; j++) {
    if (endSelect.options[j].value === previousEndVal) { hasPrevEnd = true; break; }
  }

  if (hasPrevEnd && timeToMinutes(previousEndVal) > startMin) {
    endSelect.value = previousEndVal;
  } else {
    var defaultEndMin = Math.min(closeMin, startMin + 60);
    endSelect.value = minutesToTime(defaultEndMin);
  }
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
    badge.style.borderColor = '#fca5a5';
    return;
  }
  var h = Math.floor(diff / 60), m = diff % 60;
  var str = (h > 0 ? h + ' ชม. ' : '') + (m > 0 ? m + ' นาที' : '');
  badge.innerHTML = '<i class="bi bi-hourglass-split"></i> รวม ' + str;
  badge.style.background = '#f0fdf4';
  badge.style.color = '#166534';
  badge.style.borderColor = '#bbf7d0';
}

function applyTimeDuration(mins, btn) {
  var start = document.getElementById('bkStart').value;
  if (!start) return;
  var startMins = timeToMinutes(start);
  var closeTime = extractCleanTime(STATE.settings.CLOSE_HOUR, '20:00');
  var closeMin = timeToMinutes(closeTime);
  var endStr = minutesToTime(Math.min(closeMin, startMins + mins));

  var endSelect = document.getElementById('bkEnd');
  ensureTimeOptionExists(endSelect, endStr);
  endSelect.value = endStr;

  document.querySelectorAll('.time-preset-btn').forEach(function(b) { b.classList.remove('active'); });
  if (btn) btn.classList.add('active');

  updateDurationBadge();
  triggerAutoCheckAvailability();
}

 function applyTimePreset(startTime, endTime, btn) {
    var startSelect = document.getElementById('bkStart');
    var endSelect = document.getElementById('bkEnd');
    var dateInput = document.getElementById('bkDate');
    var isToday = (dateInput && dateInput.value === todayIso());

    // ตรวจสอบเฉพาะเมื่อจองสำหรับ "วันนี้" และเวลาเริ่มต้นผ่านไปแล้ว
    if (isToday) {
      var now = new Date();
      var nowMinutes = now.getHours() * 60 + now.getMinutes();
      if (timeToMinutes(startTime) <= nowMinutes) {
        showToast('เวลาเริ่มต้น ' + startTime + ' น. ได้ผ่านไปแล้วสำหรับวันนี้', 'warning');
        return;
      }
    }

    ensureTimeOptionExists(startSelect, startTime);
    startSelect.value = startTime;

    rebuildEndTimeOptions();
    ensureTimeOptionExists(endSelect, endTime);
    endSelect.value = endTime;

    // เคลียร์และเซ็ต Active ให้ปุ่มที่ถูกกด
    document.querySelectorAll('.time-preset-btn').forEach(function(b) { 
      b.classList.remove('active'); 
    });
    
    if (btn) {
      btn.classList.add('active');
    } else {
      // ค้นหาปุ่มที่ตรงกับช่วงเวลาแล้วใส่ class active ให้
      document.querySelectorAll('.time-preset-btn').forEach(function(b) {
        if (b.getAttribute('onclick') && b.getAttribute('onclick').indexOf(startTime) !== -1) {
          b.classList.add('active');
        }
      });
    }

    updateDurationBadge();
    triggerAutoCheckAvailability();
  }

function disableTimePresets(disabled) {
  document.querySelectorAll('.time-preset-btn').forEach(function(b) { b.disabled = disabled; b.style.opacity = disabled ? '0.35' : '1'; });
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
  if (!banner) return;

  if (!roomId || !date || !startTime || !endTime) { banner.innerHTML = ''; return; }
  
  if (timeToMinutes(startTime) >= timeToMinutes(endTime)) {
    banner.innerHTML = '<div style="background: #fef2f2; border: 1px solid #fecaca; border-left: 5px solid #dc2626; padding: 14px 18px; border-radius: 10px; color: #991b1b; display: flex; align-items: center; gap: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">' +
      '<i class="bi bi-exclamation-triangle-fill" style="font-size: 22px; color: #dc2626;"></i>' +
      '<div style="font-size: 14px; font-weight: 600;">เวลาเริ่มต้นต้องน้อยกว่าเวลาสิ้นสุด</div></div>';
    return;
  }

  banner.innerHTML = '<div style="background: #f8fafc; border: 1px solid #e2e8f0; border-left: 5px solid #0284c7; padding: 14px 18px; border-radius: 10px; color: #475569; display: flex; align-items: center; gap: 12px;">' +
    '<i class="bi bi-arrow-repeat spin" style="font-size: 22px; color: #0284c7;"></i>' +
    '<div style="font-size: 14px; font-weight: 600;">กำลังตรวจสอบตารางการใช้ห้องประชุมแบบ Real-time...</div></div>';

  callGas('checkRoomAvailability', { roomId: roomId, date: date, startTime: startTime, endTime: endTime })
    .then(function(res) {
      var avail = res.data;
      if (avail.available) {
        // ดีไซน์กล่อง "ห้องว่าง พร้อมจอง" แบบ Modern พรีเมียม
        banner.innerHTML = '<div style="background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); border: 1px solid #bbf7d0; border-left: 5px solid #16a34a; padding: 16px 20px; border-radius: 12px; color: #166534; display: flex; align-items: center; gap: 14px; box-shadow: 0 4px 6px -1px rgba(22, 163, 74, 0.1);">' +
          '<div style="background: #16a34a; color: #fff; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0;"><i class="bi bi-check-lg"></i></div>' +
          '<div>' +
            '<div style="font-size: 15px; font-weight: 700; color: #14532d;">ห้องว่าง พร้อมจองใช้งาน!</div>' +
            '<div style="font-size: 13.5px; color: #166534; margin-top: 2px;">ในช่วงเวลา <strong>' + startTime + ' - ' + endTime + ' น.</strong> สามารถดำเนินการจองต่อได้ทันที</div>' +
          '</div></div>';
      } else {
        // ดีไซน์กล่อง "ไม่ว่าง / ชนเวลากับผู้อื่น" พร้อมช่วงเวลาแนะนำที่สวยงามขึ้น
        var html = '<div style="background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%); border: 1px solid #fecaca; border-left: 5px solid #dc2626; padding: 16px 20px; border-radius: 12px; color: #991b1b; box-shadow: 0 4px 6px -1px rgba(220, 38, 38, 0.1);">' +
          '<div style="display: flex; align-items: flex-start; gap: 14px;">' +
            '<div style="background: #dc2626; color: #fff; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0;"><i class="bi bi-x-lg"></i></div>' +
            '<div style="width: 100%;">' +
              '<div style="font-size: 15px; font-weight: 700; color: #7f1d1d;">ไม่สามารถจองได้ เนื่องจากห้องถูกใช้งานในช่วงเวลานี้แล้ว</div>' +
              '<div style="font-size: 13px; color: #b91c1c; margin-top: 2px;">กรุณาเลือกช่วงเวลาอื่น หรือพิจารณาเลือกช่วงเวลาว่างใกล้เคียงด้านล่าง:</div>';
        
        if (avail.suggestedSlots && avail.suggestedSlots.length > 0) {
          html += '<div style="margin-top: 12px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center;">';
          avail.suggestedSlots.forEach(function(s) {
            html += '<button type="button" class="btn btn-sm" style="background: #fff; border: 1px solid #fca5a5; color: #991b1b; font-weight: 600; font-size: 12.5px; padding: 6px 12px; border-radius: 20px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); cursor: pointer;" onclick="applyTimePreset(\'' + s.startTime + '\',\'' + s.endTime + '\')">' +
              '<i class="bi bi-clock-history"></i> ' + s.startTime + ' - ' + s.endTime + ' น.' +
            '</button>';
          });
          html += '</div>';
        }
        
        html += '</div></div></div>';
        banner.innerHTML = html;
      }
    })
    .catch(function(err) {
      banner.innerHTML = '<div style="background: #fef2f2; border: 1px solid #fecaca; border-left: 5px solid #dc2626; padding: 14px 18px; border-radius: 10px; color: #991b1b; font-weight: 600;">ไม่สามารถตรวจสอบสถานะได้: ' + escapeHtml(err.message) + '</div>';
    });
}

function checkAvailabilityClick() { performLiveAvailabilityCheck(); }
function applySuggestedTime(s, e) { applyTimePreset(s, e); }

/* ==========================================================================
 * Seating Layout Selector & Automatic Mapping
 * ======================================================================== */
function renderBookingLayoutCards() {
  var container = document.getElementById('bookingLayoutGrid');
  if (!container || !STATE.layouts || STATE.layouts.length === 0) return;

  var currentVal = document.getElementById('bkSeatingLayout').value || 'แบบชั้นเรียน (Classroom)';
  var html = '';

  STATE.layouts.forEach(function(l) {
    var isSelected = (l.name === currentVal || l.id === currentVal) ? 'selected' : '';
    html += '<div class="layout-card ' + isSelected + '" id="layout-card-' + l.id + '" onclick="selectSeatingLayout(\'' + l.id + '\')">' +
      '<div class="layout-media-wrap">' +
        '<img id="img-layout-' + l.id + '" src="' + escapeHtml(l.diagramUrl) + '" alt="' + escapeHtml(l.name) + '">' +
        '<div class="layout-tab-pill" onclick="event.stopPropagation();">' +
          '<button type="button" class="layout-tab-btn active" id="btn-dia-' + l.id + '" onclick="toggleCardImage(\'' + l.id + '\', \'diagram\')">แผนผัง</button>' +
          '<button type="button" class="layout-tab-btn" id="btn-pho-' + l.id + '" onclick="toggleCardImage(\'' + l.id + '\', \'photo\')">ภาพจริง</button>' +
        '</div>' +
      '</div>' +
      '<div class="layout-info">' +
        '<div class="layout-title"><span>' + escapeHtml(l.name) + '</span></div>' +
        '<div class="layout-desc">' + escapeHtml(l.desc) + '</div>' +
        '<button type="button" class="btn-preview-layout" onclick="event.stopPropagation(); openLayoutBigPreview(\'' + l.id + '\')"><i class="bi bi-zoom-in"></i> ขยายดูรูปใหญ่</button>' +
      '</div></div>';
  });
  container.innerHTML = html;
}

function toggleCardImage(layoutId, mode) {
  var layout = STATE.layouts.find(function(x) { return x.id === layoutId; });
  if (!layout) return;
  var img = document.getElementById('img-layout-' + layoutId);
  var btnDia = document.getElementById('btn-dia-' + layoutId);
  var btnPho = document.getElementById('btn-pho-' + layoutId);
  if (!img) return;
  if (mode === 'diagram') {
    img.src = layout.diagramUrl;
    if (btnDia) btnDia.classList.add('active');
    if (btnPho) btnPho.classList.remove('active');
  } else {
    img.src = layout.photoUrl;
    if (btnPho) btnPho.classList.add('active');
    if (btnDia) btnDia.classList.remove('active');
  }
}

function selectSeatingLayout(layoutId) {
  var layout = STATE.layouts.find(function(x) { return x.id === layoutId; });
  if (!layout) return;
  var input = document.getElementById('bkSeatingLayout');
  if (input) input.value = layout.name;
  document.querySelectorAll('.layout-card').forEach(function(c) { c.classList.remove('selected'); });
  var activeCard = document.getElementById('layout-card-' + layoutId);
  if (activeCard) activeCard.classList.add('selected');
}

function onMeetingTypeChanged() {
  var typeSelect = document.getElementById('bkMeetingType');
  if (!typeSelect) return;
  var defaultLayoutMap = { 'On-site': 'classroom', 'Online': 'boardroom', 'Hybrid': 'ushape' };
  var targetLayoutId = defaultLayoutMap[typeSelect.value] || 'classroom';
  selectSeatingLayout(targetLayoutId);
  var layout = STATE.layouts.find(function(x) { return x.id === targetLayoutId; });
  if (layout) showToast('แนะนำผังโต๊ะอัตโนมัติ: ' + layout.name, 'info');
}

function openLayoutBigPreview(layoutId) {
  var layout = STATE.layouts.find(function(x) { return x.id === layoutId; });
  if (!layout) return;
  STATE.currentPreviewLayout = layout;
  document.getElementById('layoutPreviewTitle').innerHTML = '<i class="bi bi-grid-3x3-gap"></i> รูปแบบ: ' + escapeHtml(layout.name);
  document.getElementById('layoutPreviewDesc').textContent = layout.desc;
  switchPreviewMode('photo');
  openModal('layoutPreviewModal');
}

function switchPreviewMode(mode) {
  if (!STATE.currentPreviewLayout) return;
  var img = document.getElementById('layoutBigImage');
  var btnDia = document.getElementById('btnShowDiagram');
  var btnPho = document.getElementById('btnShowPhoto');
  if (!img) return;
  if (mode === 'diagram') {
    img.src = STATE.currentPreviewLayout.diagramUrl;
    if (btnDia) btnDia.className = 'btn btn-primary btn-sm';
    if (btnPho) btnPho.className = 'btn btn-outline btn-sm';
  } else {
    img.src = STATE.currentPreviewLayout.photoUrl;
    if (btnPho) btnPho.className = 'btn btn-primary btn-sm';
    if (btnDia) btnDia.className = 'btn btn-outline btn-sm';
  }
}
/* ==========================================================================
 * Booking Flow, Summary Modal & Redirect to My Bookings
 * ======================================================================== */
function selectRoomFromAvail(roomId) {
  var select = document.getElementById('bkRoomId');
  if (select) select.value = roomId;
  syncSelectedRoomCard();
  triggerAutoCheckAvailability();
}

function syncSelectedRoomCard() {
  var selectedId = document.getElementById('bkRoomId').value;
  var items = document.querySelectorAll('.avail-item');
  items.forEach(function(el) {
    el.classList.toggle('selected', el.getAttribute('data-room-id') === selectedId);
  });
}

function submitBookingForm(e) {
  e.preventDefault();
  var seatingVal = document.getElementById('bkSeatingLayout') ? document.getElementById('bkSeatingLayout').value : 'แบบชั้นเรียน (Classroom)';

  var payload = {
    bookerName: document.getElementById('bkName').value.trim(),
    department: document.getElementById('bkDept').value,
    phone: document.getElementById('bkPhone').value.trim(),
    userEmail: document.getElementById('bkEmail').value.trim(),
    roomId: document.getElementById('bkRoomId').value,
    date: document.getElementById('bkDate').value,
    startTime: document.getElementById('bkStart').value,
    endTime: document.getElementById('bkEnd').value,
    topic: document.getElementById('bkTopic').value.trim(),
    participants: Number(document.getElementById('bkParticipants').value),
    seatingLayout: seatingVal,
    meetingType: document.getElementById('bkMeetingType').value,
    equipment: document.getElementById('bkEquipment').value.trim(),
    detail: document.getElementById('bkDetail').value.trim()
  };

  if (timeToMinutes(payload.startTime) >= timeToMinutes(payload.endTime)) {
    Swal.fire({
      icon: 'warning',
      title: 'เวลาไม่ถูกต้อง',
      text: 'เวลาเริ่มต้นต้องน้อยกว่าเวลาสิ้นสุด',
      confirmButtonColor: '#0f4c81',
      confirmButtonText: 'ตกลง'
    });
    return;
  }

  showBookingSummaryConfirmation(payload);
}

function showBookingSummaryConfirmation(payload) {
  var room = STATE.rooms.find(function(r) { return r.RoomID === payload.roomId; }) || {};
  var roomName = room.RoomName || payload.roomId;
  var roomLocation = (room.Building ? room.Building : '') + (room.Floor ? ' ' + room.Floor : '');
  var thaiDate = formatDisplayDateThai(payload.date);

  var diffMin = timeToMinutes(payload.endTime) - timeToMinutes(payload.startTime);
  var durationText = (Math.floor(diffMin / 60) > 0 ? Math.floor(diffMin / 60) + ' ชม. ' : '') +
                     (diffMin % 60 > 0 ? (diffMin % 60) + ' นาที' : '');

  var summaryHtml = [
    '<div style="text-align:left; font-size:14px; color:#1e293b; line-height:1.6;">',
      '<div style="background:#f0f9ff; border:1px solid #bae6fd; border-radius:12px; padding:12px 16px; margin-bottom:14px;">',
        '<div style="font-weight:700; color:#0f4c81; font-size:16px;">🏢 ' + escapeHtml(roomName) + '</div>',
        (roomLocation ? '<div style="font-size:12.5px; color:#64748b; margin-top:2px;"><i class="bi bi-geo-alt"></i> ' + escapeHtml(roomLocation) + '</div>' : ''),
        '<div style="font-size:13.5px; color:#0284c7; font-weight:600; margin-top:6px;">',
          '<i class="bi bi-calendar3"></i> ' + escapeHtml(thaiDate) + ' &bull; <i class="bi bi-clock"></i> ' + escapeHtml(payload.startTime) + ' - ' + escapeHtml(payload.endTime) + ' น. (' + durationText + ')',
        '</div>',
      '</div>',
      '<table style="width:100%; font-size:13.5px; border-collapse:collapse;">',
        '<tr><td style="color:#64748b; width:125px; padding:4px 0; vertical-align:top;">หัวข้อประชุม:</td><td style="font-weight:700; padding:4px 0;">' + escapeHtml(payload.topic) + '</td></tr>',
        '<tr><td style="color:#64748b; padding:4px 0; vertical-align:top;">ผู้ขอใช้ห้อง:</td><td style="padding:4px 0;">' + escapeHtml(payload.bookerName) + ' (' + escapeHtml(payload.department) + ')</td></tr>',
        '<tr><td style="color:#64748b; padding:4px 0; vertical-align:top;">เบอร์ติดต่อ:</td><td style="padding:4px 0;">' + escapeHtml(payload.phone) + '</td></tr>',
        '<tr><td style="color:#64748b; padding:4px 0; vertical-align:top;">ผู้เข้าร่วม:</td><td style="padding:4px 0;">' + payload.participants + ' คน (' + escapeHtml(payload.meetingType) + ')</td></tr>',
        '<tr><td style="color:#64748b; padding:4px 0; vertical-align:top;">ผังโต๊ะเก้าอี้:</td><td style="color:#0d9488; font-weight:700; padding:4px 0;"><i class="bi bi-grid-3x3-gap"></i> ' + escapeHtml(payload.seatingLayout) + '</td></tr>',
        (payload.equipment ? '<tr><td style="color:#64748b; padding:4px 0; vertical-align:top;">อุปกรณ์เพิ่ม:</td><td style="padding:4px 0;">' + escapeHtml(payload.equipment) + '</td></tr>' : ''),
        (payload.detail ? '<tr><td style="color:#64748b; padding:4px 0; vertical-align:top;">รายละเอียด:</td><td style="padding:4px 0;">' + escapeHtml(payload.detail) + '</td></tr>' : ''),
      '</table>',
      '<div style="margin-top:12px; font-size:12px; color:#94a3b8; text-align:center; border-top:1px dashed #e2e8f0; padding-top:8px;">',
        'กรุณาตรวจสอบข้อมูลให้ถูกต้องก่อนกดยืนยันการจอง',
      '</div>',
    '</div>'
  ].join('');

  Swal.fire({
    title: '📋 สรุปและยืนยันข้อมูลการจอง',
    html: summaryHtml,
    icon: 'info',
    showCancelButton: true,
    confirmButtonColor: '#0f4c81',
    cancelButtonColor: '#64748b',
    confirmButtonText: '<i class="bi bi-check2-circle"></i> ยืนยันการจองห้อง',
    cancelButtonText: '<i class="bi bi-pencil"></i> กลับไปแก้ไข',
    reverseButtons: true
  }).then(function(result) {
    if (result.isConfirmed) {
      executeBookingSubmit(payload);
    }
  });
}

function executeBookingSubmit(payload) {
  var btn = document.getElementById('btnSubmitBooking');
  if (btn) btn.disabled = true;
  setLoading(true, 'กำลังบันทึกการจองห้องประชุม...');

  callGas('createBooking', STATE.token, payload)
    .then(function(res) {
      if (!res.success && res.code === 'CONFLICT') {
        performLiveAvailabilityCheck();
        Swal.fire({
          icon: 'warning',
          title: 'เวลาทับซ้อนกัน',
          text: res.message,
          confirmButtonColor: '#0f4c81',
          confirmButtonText: 'เลือกช่วงเวลาใหม่'
        });
        return;
      }

      refreshBadgesImmediately();
      if (typeof loadCalendarEvents === 'function') {
        loadCalendarEvents(); // อัปเดตข้อมูลในปฏิทินทันที
      }

      document.getElementById('bookingForm').reset();
      document.getElementById('bkDate').value = payload.date;
      document.getElementById('availCheckDate').value = payload.date;

      if (STATE.user.authenticated) {
        document.getElementById('bkName').value = STATE.user.name || '';
        document.getElementById('bkEmail').value = STATE.user.email || '';
        if (STATE.user.department) document.getElementById('bkDept').value = STATE.user.department;
        if (STATE.user.phone) document.getElementById('bkPhone').value = STATE.user.phone;
      }

      onBookingDateChanged();
      renderBookingLayoutCards();

      Swal.fire({
        icon: 'success',
        title: 'จองห้องประชุมสำเร็จ!',
        html: 'รหัสการจอง: <strong>' + escapeHtml(res.data.booking.BookingID) + '</strong><br>' +
              '<small style="color:#64748b;">ระบบกำลังนำคุณไปยังหน้ารายการจองของฉัน...</small>',
        confirmButtonColor: '#0f4c81',
        confirmButtonText: '<i class="bi bi-journal-check"></i> ไปที่รายการจองของฉัน',
        timer: 2500,
        timerProgressBar: true
      }).then(function() {
        navigateTo('mybookings');
      });
    })
    .catch(function(err) {
      Swal.fire({ icon: 'error', title: 'บันทึกการจองไม่สำเร็จ', text: err.message, confirmButtonColor: '#0f4c81' });
    })
    .finally(function() {
      if (btn) btn.disabled = false;
      setLoading(false);
    });
}

/* ==========================================================================
 * Rooms Directory, My Bookings, Search, Detail QR & PDF
 * ======================================================================== */
function renderRoomsDirectory() {
  var grid = document.getElementById('roomsDirectoryGrid');
  if (!grid) return;

  var html = '';
  STATE.rooms.forEach(function(r) {
    var img = r.ImageURL || 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=800';
    
    // ปรับปรุงเลย์เอาต์การ์ดห้องประชุมให้มีความสูงคงที่ รูปภาพขนาดพอดี และจัดวางปุ่มจองไว้ชิดล่างเสมอ
    html += '<div style="background:#fff; border:1px solid var(--border); border-radius:12px; overflow:hidden; display:flex; flex-direction:column; box-shadow:0 1px 3px 0 rgba(0,0,0,0.05);">' +
      '<div style="position:relative; height:200px; background:#e2e8f0; overflow:hidden;">' +
        '<img src="' + escapeHtml(img) + '" alt="' + escapeHtml(r.RoomName) + '" style="width:100%; height:100%; object-fit:cover;">' +
        '<span class="badge badge-approved" style="position:absolute; top:12px; right:12px; font-weight:700; box-shadow:0 2px 4px rgba(0,0,0,0.15);">' + r.Capacity + ' ที่นั่ง</span>' +
      '</div>' +
      '<div style="padding:18px; flex-grow:1; display:flex; flex-direction:column;">' +
        '<h3 style="font-size:18px; color:var(--primary); font-weight:700; margin-bottom:6px;">' + escapeHtml(r.RoomName) + '</h3>' +
        '<div style="font-size:13.5px; color:var(--muted); margin-bottom:10px;"><i class="bi bi-geo-alt"></i> ' + escapeHtml(r.Building) + ' ชั้น ' + escapeHtml(r.Floor) + '</div>' +
        '<p style="font-size:13.5px; color:#475569; margin-bottom:12px; line-height:1.5;">' + escapeHtml(r.Description || 'ไม่มีรายละเอียดเพิ่มเติม') + '</p>' +
        '<div style="font-size:13px; color:var(--muted); margin-bottom:16px; background:#f8fafc; padding:10px; border-radius:8px; border:1px solid #f1f5f9;">' +
          '<div style="margin-bottom:4px;"><strong>อุปกรณ์:</strong> ' + escapeHtml(r.Equipment || '-') + '</div>' +
          '<div><strong>ผู้รับผิดชอบ:</strong> ' + escapeHtml(r.Responsible || '-') + '</div>' +
        '</div>' +
        '<button class="btn btn-primary btn-sm" style="margin-top:auto; width:100%; justify-content:center;" onclick="quickBookRoom(\'' + escapeHtml(r.RoomID) + '\')">' +
          '<i class="bi bi-calendar-plus"></i> จองห้องนี้' +
        '</button>' +
      '</div>' +
    '</div>';
  });
  grid.innerHTML = html;
}

function quickBookRoom(roomId) {
  if (!STATE.user.authenticated) {
    Swal.fire({
      icon: 'info',
      title: 'ต้องเข้าสู่ระบบก่อน',
      text: 'กรุณาเข้าสู่ระบบบุคลากรเพื่อทำการจองห้องประชุม',
      confirmButtonColor: '#0f4c81',
      confirmButtonText: 'เข้าสู่ระบบ'
    }).then(function() {
      openLoginModal();
    });
    return;
  }

  navigateTo('booking');
  setTimeout(function() { selectRoomFromAvail(roomId); }, 150);
}

/**
 * โหลดและแสดงรายการจองของฉัน พร้อมอัปเดตตัวเลข Badge และตรวจสอบสถานะอนุมัติ
 */
function loadMyBookings() {
  var emailInput = document.getElementById('myBookingEmailInput').value.trim();
  var tbody = document.getElementById('myBookingsBody');
  if (!tbody) return;

  if (!STATE.user.authenticated && !emailInput) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--muted); padding:16px;">กรุณาเข้าสู่ระบบ หรือกรอกอีเมลเพื่อค้นหารายการจองของคุณ</td></tr>';
    return;
  }

  setLoading(true, 'กำลังโหลดรายการจอง...');
  callGas('searchBookings', STATE.token, { myOnly: true, userEmail: emailInput })
    .then(function(res) {
      var list = res.data || [];
      
      // คำนวณจำนวนรายการจองที่ยัง Active อยู่ (รออนุมัติ หรือ อนุมัติแล้ว) เพื่อนําไปแสดง Badge สีแดง
      var activeCount = list.filter(function(x) {
        var st = x.EffectiveStatus || x.Status;
        return st === 'รออนุมัติ' || st === 'อนุมัติ';
      }).length;
      updateMyBookingsBadge(activeCount);
      
      // ตรวจสอบและเด้ง Popup แจ้งผลการอนุมัติ/ไม่อนุมัติอัตโนมัติ
      checkBookerStatusUpdates(list);

      if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--muted); padding:16px;">ไม่พบรายการจอง</td></tr>';
        return;
      }

      var html = '';
      list.forEach(function(b) {
        var st = b.EffectiveStatus || b.Status;
        var canCancel = (STATE.user.authenticated && (st === 'รออนุมัติ' || st === 'อนุมัติ'));
        var cancelBtn = canCancel ? ('<button class="btn btn-danger btn-sm" onclick="cancelMyBooking(\'' + escapeHtml(b.BookingID) + '\')"><i class="bi bi-x-circle"></i> ยกเลิก</button>') : '';

        var thaiDate = formatDisplayDateThai(b.Date);
        var statusHint = '';
        if (st === 'รออนุมัติ') statusHint = '<br><small style="color:#d97706;"><i class="bi bi-hourglass-split"></i> กำลังรอผู้ดูแลตรวจสอบ</small>';
        else if (st === 'อนุมัติ') statusHint = '<br><small style="color:#16a34a;"><i class="bi bi-check-circle"></i> พร้อมใช้งานตามกำหนด</small>';
        else if (st === 'ไม่อนุมัติ') statusHint = '<br><small style="color:#dc2626;"><i class="bi bi-x-circle"></i> ไม่ได้รับการอนุมัติ</small>';

        html += '<tr>' +
          '<td><strong>' + escapeHtml(b.BookingID) + '</strong></td>' +
          '<td>' + escapeHtml(thaiDate) + '<br><small>' + escapeHtml(b.StartTime) + '–' + escapeHtml(b.EndTime) + ' น.</small></td>' +
          '<td>' + escapeHtml(b.RoomName) + '</td>' +
          '<td>' + escapeHtml(b.Topic) + '</td>' +
          '<td>' + statusBadge(st) + statusHint + '</td>' +
          '<td style="white-space:nowrap;">' +
          '<button class="btn btn-outline btn-sm" onclick="openBookingDetailModal(\'' + escapeHtml(b.BookingID) + '\')" title="ดูรายละเอียด & QR Code"><i class="bi bi-qr-code"></i></button> ' +
          cancelBtn +
          '</td>' +
          '</tr>';
      });
      tbody.innerHTML = html;
    })
    .catch(function(err) {
      showToast(err.message, 'error');
    })
    .finally(function() {
      setLoading(false);
    });
}

function cancelMyBooking(bookingId) {
  Swal.fire({
    title: 'ยกเลิกการจองห้องประชุม',
    text: 'รหัสการจอง: ' + bookingId,
    input: 'textarea',
    inputPlaceholder: 'กรุณาระบุเหตุผลในการขอยกเลิกห้องประชุม...',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#dc2626',
    cancelButtonColor: '#64748b',
    confirmButtonText: '<i class="bi bi-x-circle"></i> ยืนยันยกเลิกและแจ้งผู้ดูแล',
    cancelButtonText: 'ปิดหน้าต่าง',
    inputValidator: function(value) {
      if (!value || !value.trim()) {
        return 'กรุณาระบุเหตุผลในการยกเลิกเพื่อแจ้งให้ผู้ดูแลระบบทราบ';
      }
    }
  }).then(function(result) {
    if (result.isConfirmed) {
      setLoading(true, 'กำลังดำเนินการยกเลิกและแจ้งเตือนผู้ดูแล...');
      // 📌 ส่งค่า cancelReason ไปในออบเจกต์ payload
      callGas('cancelBooking', STATE.token, { bookingId: bookingId, cancelReason: result.value.trim() })
        .then(function(res) {
          Swal.fire({
            icon: 'success',
            title: 'ยกเลิกการจองสำเร็จ',
            text: 'ระบบได้บันทึกการยกเลิกและส่งข้อความแจ้งผู้ดูแลระบบเรียบร้อยแล้ว',
            confirmButtonColor: '#0f4c81',
            timer: 2500,
            timerProgressBar: true
          });
          loadMyBookings();
          refreshBadgesImmediately();
        })
        .catch(function(err) {
          Swal.fire({ icon: 'error', title: 'ไม่สามารถยกเลิกได้', text: err.message, confirmButtonColor: '#0f4c81' });
        })
        .finally(function() { setLoading(false); });
    }
  });
}

function runBookingSearch() {
  setLoading(true, 'กำลังค้นหา...');
  var filters = {
    query: document.getElementById('searchQuery').value,
    roomId: document.getElementById('searchRoom').value,
    date: document.getElementById('searchDate').value,
    status: document.getElementById('searchStatus').value
  };

  callGas('searchBookings', STATE.token, filters)
    .then(function(res) {
      var list = res.data || [];
      var tbody = document.getElementById('searchResultBody');
      if (!tbody) return;

      if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:var(--muted); padding:16px;">ไม่พบข้อมูลที่ตรงกับเงื่อนไข</td></tr>';
        return;
      }

      var html = '';
      list.forEach(function(b) {
        var thaiDate = formatDisplayDateThai(b.Date);
        html += '<tr>' +
          '<td><strong>' + escapeHtml(b.BookingID) + '</strong></td>' +
          '<td>' + escapeHtml(thaiDate) + '</td>' +
          '<td>' + escapeHtml(b.StartTime) + '–' + escapeHtml(b.EndTime) + '</td>' +
          '<td>' + escapeHtml(b.RoomName) + '</td>' +
          '<td>' + escapeHtml(b.Topic) + '</td>' +
          '<td>' + escapeHtml(b.BookerName) + '<br><small style="color:var(--muted);">' + escapeHtml(b.Department) + '</small></td>' +
          '<td>' + statusBadge(b.EffectiveStatus || b.Status) + '</td>' +
          '<td><button class="btn btn-outline btn-sm" onclick="openBookingDetailModal(\'' + escapeHtml(b.BookingID) + '\')"><i class="bi bi-eye"></i></button></td>' +
          '</tr>';
      });
      tbody.innerHTML = html;
    })
    .catch(function(err) { showToast(err.message, 'error'); })
    .finally(function() { setLoading(false); });
}

function resetBookingSearch() {
  document.getElementById('searchQuery').value = '';
  document.getElementById('searchRoom').value = '';
  document.getElementById('searchDate').value = '';
  document.getElementById('searchStatus').value = '';
  runBookingSearch();
}

function openBookingDetailModal(bookingId) {
  setLoading(true, 'กำลังโหลดรายละเอียด...');
  callGas('getBookingById', bookingId)
    .then(function(res) {
      var b = res.data.booking;
      var qrUrl = window.location.origin + window.location.pathname + '?page=detail&bookingId=' + encodeURIComponent(b.BookingID);
      var st = b.EffectiveStatus || b.Status;
      var layoutText = b.SeatingLayout || 'แบบชั้นเรียน (Classroom)';
      var thaiDate = formatDisplayDateThai(b.Date);

      var modalBody = document.getElementById('detailModalBody');
      if (!modalBody) return;

      modalBody.innerHTML = '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">' +
        '<strong style="font-size:17px; color:var(--primary);">' + escapeHtml(b.BookingID) + '</strong>' +
        statusBadge(st) +
        '</div>' +
        '<table style="font-size:14px;">' +
        '<tr><th style="width:130px;">ห้องประชุม</th><td>' + escapeHtml(b.RoomName) + '</td></tr>' +
        '<tr><th>หัวข้อประชุม</th><td><strong>' + escapeHtml(b.Topic) + '</strong></td></tr>' +
        '<tr><th>ผังโต๊ะเก้าอี้</th><td><strong style="color:var(--teal);"><i class="bi bi-grid-3x3-gap"></i> ' + escapeHtml(layoutText) + '</strong></td></tr>' +
        '<tr><th>วันที่</th><td>' + escapeHtml(thaiDate) + '</td></tr>' +
        '<tr><th>เวลา</th><td>' + escapeHtml(b.StartTime) + ' – ' + escapeHtml(b.EndTime) + ' น.</td></tr>' +
        '<tr><th>ผู้จอง</th><td>' + escapeHtml(b.BookerName) + ' (' + escapeHtml(b.Department) + ')</td></tr>' +
        '<tr><th>ผู้เข้าร่วม</th><td>' + escapeHtml(b.Participants) + ' คน (' + escapeHtml(b.MeetingType || 'On-site') + ')</td></tr>' +
        '<tr><th>อุปกรณ์</th><td>' + escapeHtml(b.Equipment || '-') + '</td></tr>' +
        '<tr><th>รายละเอียด</th><td>' + escapeHtml(b.Detail || '-') + '</td></tr>' +
        '</table>' +
        '<div style="margin-top:14px; text-align:center;">' +
          '<button type="button" class="btn btn-outline btn-sm" onclick="downloadBookingPdf(\'' + escapeHtml(b.BookingID) + '\')">' +
            '<i class="bi bi-file-earmark-pdf-fill" style="color:#dc2626;"></i> พิมพ์ / ดาวน์โหลดใบขอใช้ห้องประชุม (PDF)' +
          '</button>' +
        '</div>' +
        '<div class="qr-box">' +
        '<div id="detailQrContainer"></div>' +
        '<small style="margin-top:8px; color:var(--muted);">สแกน QR Code เพื่อเปิดดูข้อมูลการจองนี้</small>' +
        '</div>';

      openModal('detailModal');
      new QRCode(document.getElementById('detailQrContainer'), {
        text: qrUrl, width: 140, height: 140, colorDark: '#0f4c81', colorLight: '#ffffff'
      });
    })
    .catch(function(err) { showToast(err.message, 'error'); })
    .finally(function() { setLoading(false); });
}

function downloadBookingPdf(bookingId) {
  setLoading(true, 'กำลังสร้างไฟล์เอกสาร PDF...');
  callGas('generateBookingPdf', STATE.token, bookingId)
    .then(function(res) {
      var link = document.createElement('a');
      link.href = res.data.base64;
      link.download = res.data.fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast('ดาวน์โหลดเอกสาร PDF สำเร็จ', 'success');
    })
    .catch(function(err) {
      Swal.fire({ icon: 'error', title: 'ไม่สามารถสร้าง PDF ได้', text: err.message, confirmButtonColor: '#0f4c81' });
    })
    .finally(function() { setLoading(false); });
}

/* ==========================================================================
 * Calendar View (Month / Week / Day / List View)
 * ======================================================================== */
function loadCalendarEvents() {
  var filterEl = document.getElementById('calendarRoomFilter');
  var roomId = filterEl ? filterEl.value : '';
  var legendEl = document.getElementById('calendarLegend');
  
  if (legendEl && STATE.rooms) {
    legendEl.innerHTML = STATE.rooms.map(function(r) {
      return '<span class="legend-item"><span class="legend-dot" style="background:' + escapeHtml(r.Color) + '"></span>' + escapeHtml(r.RoomName) + '</span>';
    }).join('');
  }

  setLoading(true, 'กำลังโหลดตารางการใช้ห้องประชุม...');
  callGas('getCalendarBookings', roomId)
    .then(function(res) {
      var events = res.data || [];
      var el = document.getElementById('fullCalendarEl');
      if (!el) return;

      if (STATE.calendarInstance) {
        STATE.calendarInstance.destroy();
      }

      STATE.calendarInstance = new FullCalendar.Calendar(el, {
        locale: 'th',
        initialView: window.innerWidth < 640 ? 'listMonth' : 'dayGridMonth',
        height: 'auto',
        noEventsText: 'ไม่มีรายการจองห้องประชุมในช่วงเวลานี้',
        headerToolbar: {
          left: 'prev,next today',
          center: 'title',
          right: 'dayGridMonth,timeGridWeek,timeGridDay,listMonth'
        },
        buttonText: {
          today: 'วันนี้',
          month: 'เดือน',
          week: 'สัปดาห์',
          day: 'วัน',
          listMonth: 'รายการ'
        },
        // ปรับแต่งการแสดงผลในมุมมองแบบรายการ (List View)
        views: {
          listMonth: {
            eventContent: function(arg) {
              var p = arg.event.extendedProps || {};
              return {
                html:
                  '<div style="display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:8px; width:100%;">' +
                    '<div>' +
                      '<div style="font-weight:700; color:#0f4c81; font-size:14px;">' + escapeHtml(arg.event.title) + '</div>' +
                      '<div style="font-size:12.5px; color:#64748b; margin-top:2px;">' +
                        '<i class="bi bi-person"></i> ' + escapeHtml(p.BookerName || '-') +
                        (p.Department ? ' (' + escapeHtml(p.Department) + ')' : '') +
                        ' &bull; <i class="bi bi-people"></i> ' + escapeHtml(p.Participants || 0) + ' คน' +
                      '</div>' +
                    '</div>' +
                    '<div>' + statusBadge(p.Status || '') + '</div>' +
                  '</div>'
              };
            }
          }
        },
        events: events,
        eventClick: function(info) {
          var p = info.event.extendedProps;
          if (p && p.BookingID) {
            openBookingDetailModal(p.BookingID);
          }
        }
      });
      STATE.calendarInstance.render();

      // ป้องกันปัญหาปฏิทินไม่แสดงผลเต็มขนาดเมื่อเปลี่ยนแท็บ
      setTimeout(function() {
        if (STATE.calendarInstance) {
          STATE.calendarInstance.updateSize();
        }
      }, 120);
    })
    .catch(function(err) {
      showToast(err.message, 'error');
    })
    .finally(function() {
      setLoading(false);
    });
}

/* ==========================================================================
 * Authentication, Google Identity Services (GIS) & Profile Management
 * ======================================================================== */
/**
 * เปิดหน้าต่าง Modal สำหรับเข้าสู่ระบบหรือลงทะเบียน
 */
function openLoginModal() {
  openModal('loginModal');
}

function switchAuthTab(mode) {
  var tabL = document.getElementById('authTabLogin');
  var tabR = document.getElementById('authTabRegister');
  var formL = document.getElementById('loginForm');
  var formR = document.getElementById('registerForm');
  if (tabL) tabL.classList.toggle('active', mode === 'login');
  if (tabR) tabR.classList.toggle('active', mode === 'register');
  if (formL) formL.style.display = (mode === 'login') ? 'block' : 'none';
  if (formR) formR.style.display = (mode === 'register') ? 'block' : 'none';
}

function updateAuthUI() {
  var headerBox = document.getElementById('headerUserBox');
  var authBtn = document.getElementById('authActionBtn');
  var adminNav = document.getElementById('navAdminBtn');
  var sidebarBox = document.getElementById('sidebarUserBox');

  if (STATE.user && STATE.user.authenticated) {
    if (headerBox) headerBox.style.display = 'flex';
    if (authBtn) authBtn.style.display = 'none';

    var initialLetter = (STATE.user.name || 'U').charAt(0).toUpperCase();
    var avHead = document.getElementById('headerUserAvatar');
    if (avHead) avHead.textContent = initialLetter;

    var uName = document.getElementById('headerUserName');
    if (uName) uName.textContent = STATE.user.name;

    var uDept = document.getElementById('headerUserDept');
    if (uDept) uDept.textContent = STATE.user.department || 'บุคลากร';

    var uRole = document.getElementById('headerUserRole');
    if (uRole) {
      uRole.textContent = STATE.user.role;
      uRole.className = 'role-badge ' + (STATE.user.role || 'User');
    }

    if (sidebarBox) {
      sidebarBox.style.display = 'flex';
      var avSide = document.getElementById('sidebarUserAvatar');
      if (avSide) avSide.textContent = initialLetter;
      var sName = document.getElementById('sidebarUserName');
      if (sName) sName.textContent = STATE.user.name;
      var sDept = document.getElementById('sidebarUserDept');
      if (sDept) sDept.textContent = STATE.user.department || STATE.user.role;
    }

    var canAdmin = (['Admin', 'Approver'].indexOf(STATE.user.role) !== -1);
    if (adminNav) adminNav.style.display = canAdmin ? 'flex' : 'none';

    document.querySelectorAll('#navApprovalBtn').forEach(function(el) {
      el.style.display = canAdmin ? 'flex' : 'none';
    });

    document.querySelectorAll('.auth-required-nav, .auth-required-mobile').forEach(function(el) {
      el.style.display = (el.tagName === 'BUTTON' ? 'flex' : 'block');
    });

    var bkN = document.getElementById('bkName');
    if (bkN) bkN.value = STATE.user.name || '';
    var bkE = document.getElementById('bkEmail');
    if (bkE) bkE.value = STATE.user.email || '';
    var bkD = document.getElementById('bkDept');
    if (bkD && STATE.user.department) bkD.value = STATE.user.department;
    var bkP = document.getElementById('bkPhone');
    if (bkP) bkP.value = STATE.user.phone || '';

    var myEmailInp = document.getElementById('myBookingEmailInput');
    if (myEmailInp) myEmailInp.value = STATE.user.email || '';

  } else {
    if (headerBox) headerBox.style.display = 'none';
    if (sidebarBox) sidebarBox.style.display = 'none';
    if (adminNav) adminNav.style.display = 'none';
    document.querySelectorAll('#navApprovalBtn').forEach(function(el) { el.style.display = 'none'; });
    document.querySelectorAll('.auth-required-nav, .auth-required-mobile').forEach(function(el) { el.style.display = 'none'; });
    if (authBtn) authBtn.style.display = 'inline-flex';
  }
}

function submitLogin(e) {
  e.preventDefault();
  setLoading(true, 'กำลังตรวจสอบสิทธิ์...');
  var email = document.getElementById('loginEmail').value.trim();
  var pass = document.getElementById('loginPass').value.trim();

  var btn = document.getElementById('btnLoginSubmit');
  if (btn) btn.disabled = true;

  callGas('loginWithCredentials', email, pass)
    .then(function(res) {
      STATE.token = res.data.token;
      sessionStorage.setItem('MRB_AUTH_TOKEN', STATE.token);
      localStorage.removeItem('MRB_AUTH_TOKEN');

      STATE.user = res.data.user;
      closeModal('loginModal');
      document.getElementById('loginForm').reset();
      updateAuthUI();
      startNotificationPolling();

      Swal.fire({
        icon: 'success',
        title: 'เข้าสู่ระบบสำเร็จ!',
        text: 'ยินดีต้อนรับ ' + STATE.user.name + ' (' + STATE.user.role + ')',
        confirmButtonColor: '#0f4c81',
        timer: 2200,
        timerProgressBar: true
      });

      if (document.getElementById('view-dashboard').classList.contains('active')) {
        loadDashboard();
      }
    })
    .catch(function(err) {
      var isPending = (err.message && (err.message.indexOf('รอผู้ดูแลระบบ') !== -1 || err.message.indexOf('รออนุมัติ') !== -1));
      if (isPending) {
        Swal.fire({
          icon: 'info',
          title: 'อยู่ระหว่างรอการอนุมัติบัญชี',
          text: err.message,
          confirmButtonColor: '#0f4c81',
          confirmButtonText: 'รับทราบ'
        });
      } else {
        Swal.fire({ icon: 'error', title: 'เข้าสู่ระบบไม่สำเร็จ', text: err.message, confirmButtonColor: '#0f4c81' });
      }
    })
    .finally(function() {
      if (btn) btn.disabled = false;
      setLoading(false);
    });
}

function submitRegister(e) {
  e.preventDefault();
  setLoading(true, 'กำลังลงทะเบียนบัญชี...');
  var payload = {
    name: document.getElementById('regName').value.trim(),
    department: document.getElementById('regDept').value,
    phone: document.getElementById('regPhone').value.trim(),
    email: document.getElementById('regEmail').value.trim(),
    passcode: document.getElementById('regPass').value.trim()
  };

  var btn = document.getElementById('btnRegSubmit');
  if (btn) btn.disabled = true;

  callGas('registerStaffAccount', payload)
    .then(function(res) {
      closeModal('loginModal');
      document.getElementById('registerForm').reset();
      Swal.fire({ icon: 'success', title: 'ลงทะเบียนสำเร็จ!', text: res.message, confirmButtonColor: '#0f4c81', confirmButtonText: 'ตกลง' });
    })
    .catch(function(err) {
      Swal.fire({ icon: 'error', title: 'ลงทะเบียนไม่สำเร็จ', text: err.message, confirmButtonColor: '#0f4c81' });
    })
    .finally(function() {
      if (btn) btn.disabled = false;
      setLoading(false);
    });
}

function handleLogout() {
  Swal.fire({
    title: 'ต้องการออกจากระบบหรือไม่?',
    text: 'คุณสามารถเข้าสู่ระบบใหม่ได้ตลอดเวลา',
    icon: 'question',
    showCancelButton: true,
    confirmButtonColor: '#dc2626',
    cancelButtonColor: '#64748b',
    confirmButtonText: '<i class="bi bi-box-arrow-right"></i> ออกจากระบบ',
    cancelButtonText: 'ยกเลิก'
  }).then(function(result) {
    if (result.isConfirmed) {
      setLoading(true, 'กำลังออกจากระบบ...');
      callGas('logoutSession', STATE.token)
        .catch(function() {})
        .finally(function() {
          sessionStorage.removeItem('MRB_AUTH_TOKEN');
          localStorage.removeItem('MRB_AUTH_TOKEN');
          STATE.token = '';
          STATE.user = { authenticated: false, role: 'Guest', email: '', name: '', department: '', phone: '', googleLinked: false };
          stopNotificationPolling();
          updateAuthUI();
          setLoading(false);
          showToast('ออกจากระบบเรียบร้อยแล้ว', 'info');
          navigateTo('dashboard');
        });
    }
  });
}

function initGoogleIdentityServices() {
  if (typeof google === 'undefined' || !google.accounts || !GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID.indexOf('apps.googleusercontent.com') === -1) {
    return;
  }
  try {
    google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleGoogleSignInCallback,
      auto_select: false,
      cancel_on_tap_outside: true
    });
    var btnContainer = document.getElementById('googleSignInBtn');
    if (btnContainer) {
      google.accounts.id.renderButton(btnContainer, {
        theme: 'outline', size: 'large', text: 'signin_with', shape: 'pill', logo_alignment: 'left', width: 300, locale: 'th'
      });
    }
  } catch (err) {}
}

function handleGoogleSignInCallback(response) {
  if (!response || !response.credential) {
    showToast('ไม่ได้รับข้อมูลการยืนยันตัวตนจาก Google', 'error');
    return;
  }

  // กรณีผู้ใช้ล็อกอินอยู่แล้ว (กดผูกบัญชีจากหน้าโปรไฟล์)
  if (STATE.user && STATE.user.authenticated) {
    setLoading(true, 'กำลังผูกบัญชีเข้ากับ Google...');
    callGas('toggleGoogleBinding', STATE.token, { idToken: response.credential, actionType: 'link' })
      .then(function(res) {
        STATE.user.googleLinked = true;
        openProfileModal();
        Swal.fire({ icon: 'success', title: 'ผูกบัญชีสำเร็จ!', text: res.message, confirmButtonColor: '#0f4c81', timer: 2000 });
      })
      .catch(function(err) {
        Swal.fire({ icon: 'error', title: 'ไม่สามารถผูกบัญชีได้', text: err.message, confirmButtonColor: '#0f4c81' });
      })
      .finally(function() { setLoading(false); });
    return;
  }

  // กรณีเข้าสู่ระบบใหม่ด้วย Google
  setLoading(true, 'กำลังตรวจสอบบัญชี Google...');
  callGas('loginWithGoogle', { idToken: response.credential })
    .then(function(res) {
      STATE.token = res.data.token;
      sessionStorage.setItem('MRB_AUTH_TOKEN', STATE.token);
      localStorage.removeItem('MRB_AUTH_TOKEN');

      STATE.user = res.data.user;
      closeModal('loginModal');
      updateAuthUI();
      startNotificationPolling();

      Swal.fire({
        icon: 'success',
        title: 'เข้าสู่ระบบสำเร็จ!',
        text: 'ยินดีต้อนรับ ' + STATE.user.name,
        confirmButtonColor: '#0f4c81',
        timer: 2000,
        timerProgressBar: true
      });

      if (document.getElementById('view-dashboard').classList.contains('active')) {
        loadDashboard();
      }
    })
    .catch(function(err) {
      var isPending = (err.message && (err.message.indexOf('รอผู้ดูแลระบบ') !== -1 || err.message.indexOf('รออนุมัติ') !== -1));
      if (isPending) {
        Swal.fire({
          icon: 'info',
          title: 'อยู่ระหว่างรอการอนุมัติบัญชี',
          text: 'บัญชีของคุณลงทะเบียนเรียบร้อยแล้ว ขณะนี้อยู่ระหว่างรอผู้ดูแลระบบ (Admin) ตรวจสอบและอนุมัติการใช้งาน',
          confirmButtonColor: '#0f4c81',
          confirmButtonText: 'รับทราบ'
        });
      } else {
        Swal.fire({ icon: 'error', title: 'เข้าสู่ระบบไม่สำเร็จ', text: err.message, confirmButtonColor: '#0f4c81' });
      }
    })
    .finally(function() { setLoading(false); });
}

function openProfileModal() {
  if (!STATE.user || !STATE.user.authenticated) {
    openLoginModal();
    return;
  }
  document.getElementById('profEmail').value = STATE.user.email || '';
  document.getElementById('profName').value = STATE.user.name || '';
  document.getElementById('profPhone').value = STATE.user.phone || '';
  document.getElementById('profPass').value = '';

  var deptSel = document.getElementById('profDept');
  if (deptSel && STATE.departments) {
    var deptHtml = '<option value="">-- เลือกกอง/สำนัก --</option>';
    STATE.departments.forEach(function(d) {
      var sel = (d === STATE.user.department) ? 'selected' : '';
      deptHtml += '<option value="' + escapeHtml(d) + '" ' + sel + '>' + escapeHtml(d) + '</option>';
    });
    deptSel.innerHTML = deptHtml;
  }

  var gBadge = document.getElementById('profGoogleBadge');
  var gAction = document.getElementById('profGoogleActionWrap');
  if (gBadge && gAction) {
    var isLinked = Boolean(STATE.user.googleLinked);
    gBadge.className = 'badge ' + (isLinked ? 'badge-approved' : 'badge-cancelled');
    gBadge.textContent = isLinked ? 'ผูกแล้ว' : 'ยังไม่ผูก';

    if (isLinked) {
      gAction.innerHTML =
        '<div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px;">' +
          '<small style="color:#16a34a;"><i class="bi bi-check-circle-fill"></i> ผูกกับบัญชี Google เรียบร้อยแล้ว</small>' +
          '<button type="button" class="btn btn-outline btn-sm" onclick="unlinkGoogleClick()" style="color:#dc2626; border-color:#fca5a5; padding:4px 10px;">' +
            '<i class="bi bi-x-circle"></i> ยกเลิกการผูก' +
          '</button>' +
        '</div>';
    } else {
      gAction.innerHTML =
        '<div><small style="color:var(--muted); display:block; margin-bottom:6px;">ผูกบัญชี Google เพื่อใช้เข้าสู่ระบบในครั้งถัดไปได้ทันที</small><div id="googleLinkBtnWrap"></div></div>';
      if (typeof google !== 'undefined' && google.accounts && GOOGLE_CLIENT_ID && GOOGLE_CLIENT_ID.indexOf('apps.googleusercontent.com') !== -1) {
        try {
          google.accounts.id.renderButton(document.getElementById('googleLinkBtnWrap'), {
            theme: 'outline', size: 'medium', text: 'continue_with', shape: 'pill', locale: 'th'
          });
        } catch (e) {}
      }
    }
  }
  openModal('profileModal');
}

function submitProfileUpdate(e) {
  e.preventDefault();
  setLoading(true, 'กำลังบันทึกข้อมูลโปรไฟล์...');
  var payload = {
    name: document.getElementById('profName').value.trim(),
    department: document.getElementById('profDept').value,
    phone: document.getElementById('profPhone').value.trim(),
    passcode: document.getElementById('profPass').value.trim()
  };

  callGas('updateUserProfile', STATE.token, payload)
    .then(function(res) {
      STATE.user.name = res.data.name;
      STATE.user.department = res.data.department;
      STATE.user.phone = res.data.phone;
      updateAuthUI();
      closeModal('profileModal');
      Swal.fire({ icon: 'success', title: 'บันทึกโปรไฟล์สำเร็จ!', text: 'อัปเดตเบอร์โทรศัพท์และหน่วยงานเรียบร้อยแล้ว', confirmButtonColor: '#0f4c81' });
    })
    .catch(function(err) {
      Swal.fire({ icon: 'error', title: 'ไม่สามารถบันทึกได้', text: err.message, confirmButtonColor: '#0f4c81' });
    })
    .finally(function() { setLoading(false); });
}

function unlinkGoogleClick() {
  Swal.fire({
    title: 'ยกเลิกการผูกบัญชี Google?',
    text: 'หลังจากยกเลิกแล้ว คุณจะต้องเข้าสู่ระบบด้วยอีเมลและรหัสผ่าน/PIN แทน',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#dc2626',
    cancelButtonColor: '#64748b',
    confirmButtonText: 'ยืนยันยกเลิกการผูก',
    cancelButtonText: 'ปิด'
  }).then(function(result) {
    if (result.isConfirmed) {
      setLoading(true, 'กำลังยกเลิกการผูกบัญชี...');
      callGas('toggleGoogleBinding', STATE.token, { actionType: 'unlink' })
        .then(function(res) {
          STATE.user.googleLinked = false;
          openProfileModal();
          Swal.fire({ icon: 'success', title: 'ยกเลิกการผูกสำเร็จ', text: res.message, confirmButtonColor: '#0f4c81', timer: 2000 });
        })
        .catch(function(err) {
          Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: err.message, confirmButtonColor: '#0f4c81' });
        })
        .finally(function() { setLoading(false); });
    }
  });
}

/* ==========================================================================
 * Dashboard, Charts & Quick Dashboard Approval
 * ======================================================================== */
function loadDashboard() {
  callGas('getDashboardData', STATE.token)
    .then(function(res) {
      var kpis = res.data.kpis;
      var charts = res.data.charts;
      var recentPending = res.data.recentPending || [];

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

      // กราฟเดิม
      renderBarChart('chartByRoom', charts.byRoom.labels, charts.byRoom.values, 'จำนวนครั้งที่ใช้งาน', '#0284c7');
      renderLineChart('chartByMonth', charts.byMonth.labels, charts.byMonth.values);
      renderDoughnutChart('chartByStatus', charts.byStatus.labels, charts.byStatus.values);

      // 🟢 เพิ่มการเรนเดอร์กราฟสถิติแยกตามหน่วยงาน (แนวนอน อ่านชื่อกอง/สำนักง่าย)
      if (charts.byDepartment) {
        renderHorizontalBarChart('chartByDepartment', charts.byDepartment.labels, charts.byDepartment.values, 'จำนวนการจอง', '#0d9488');
      }

      var pendingCardContainer = document.getElementById('dashPendingCardContainer');
      var isPrivileged = STATE.user.authenticated && ['Admin', 'Approver'].indexOf(STATE.user.role) !== -1;

      if (pendingCardContainer) {
        pendingCardContainer.style.display = isPrivileged ? 'block' : 'none';
      }

      if (isPrivileged) {
        var tbody = document.getElementById('dashPendingBody');
        if (tbody) {
          if (recentPending.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--muted); padding:16px;">ไม่มีรายการรออนุมัติในขณะนี้</td></tr>';
          } else {
            var html = '';
            recentPending.forEach(function(b) {
              var thaiDate = formatDisplayDateThai(b.Date);
              html += '<tr>' +
                '<td><strong>' + escapeHtml(b.BookingID) + '</strong></td>' +
                '<td>' + escapeHtml(thaiDate) + '<br><small style="color:var(--muted);">' + escapeHtml(b.StartTime) + '–' + escapeHtml(b.EndTime) + ' น.</small></td>' +
                '<td>' + escapeHtml(b.RoomName) + '</td>' +
                '<td>' + escapeHtml(b.Topic) + '</td>' +
                '<td>' + escapeHtml(b.BookerName) + '<br><small style="color:var(--muted);">' + escapeHtml(b.Department) + '</small></td>' +
                '<td>' + statusBadge(b.Status) + '</td>' +
                '<td style="white-space:nowrap;">' +
                  '<button class="btn btn-success btn-sm" onclick="approveFromDashboard(\'' + escapeHtml(b.BookingID) + '\')" title="อนุมัติทันที" style="margin-right:4px;"><i class="bi bi-check-lg"></i> อนุมัติ</button>' +
                  '<button class="btn btn-danger btn-sm" onclick="rejectFromDashboard(\'' + escapeHtml(b.BookingID) + '\')" title="ไม่อนุมัติ" style="margin-right:4px;"><i class="bi bi-x-lg"></i> ไม่อนุมัติ</button>' +
                  '<button class="btn btn-outline btn-sm" onclick="openBookingDetailModal(\'' + escapeHtml(b.BookingID) + '\')" title="ดูรายละเอียด"><i class="bi bi-eye"></i></button>' +
                '</td></tr>';
            });
            tbody.innerHTML = html;
          }
        }
      }
    })
    .catch(function(err) { showToast(err.message, 'error'); });
}
function renderHorizontalBarChart(canvasId, labels, data, label, color) {
  if (STATE.charts[canvasId]) STATE.charts[canvasId].destroy();
  var ctx = document.getElementById(canvasId);
  if (!ctx) return;
  STATE.charts[canvasId] = new Chart(ctx, {
    type: 'bar', // ใช้ bar แต่สลับ indexAxis เป็น y เพื่อให้ชื่อกองยาวๆ อ่านง่ายขึ้น
    data: { 
      labels: labels, 
      datasets: [{ label: label, data: data, backgroundColor: color, borderRadius: 6 }] 
    },
    options: { 
      indexAxis: 'y', // ทำให้เป็นกราฟแท่งแนวนอน (เหมาะกับชื่อหน่วยงานที่ค่อนข้างยาว)
      responsive: true, 
      maintainAspectRatio: false,
      plugins: { legend: { display: false } }, 
      scales: { x: { beginAtZero: true, ticks: { precision: 0 } } } 
    }
  });
}
function renderBarChart(canvasId, labels, data, label, color) {
  if (STATE.charts[canvasId]) STATE.charts[canvasId].destroy();
  var ctx = document.getElementById(canvasId);
  if (!ctx) return;
  STATE.charts[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: { labels: labels, datasets: [{ label: label, data: data, backgroundColor: color, borderRadius: 6 }] },
    options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
  });
}

function renderLineChart(canvasId, labels, data) {
  if (STATE.charts[canvasId]) STATE.charts[canvasId].destroy();
  var ctx = document.getElementById(canvasId);
  if (!ctx) return;
  STATE.charts[canvasId] = new Chart(ctx, {
    type: 'line',
    data: { labels: labels, datasets: [{ label: 'จำนวนการจอง', data: data, borderColor: '#0d9488', backgroundColor: 'rgba(13,148,136,0.12)', fill: true, tension: 0.32 }] },
    options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
  });
}

function renderDoughnutChart(canvasId, labels, data) {
  if (STATE.charts[canvasId]) STATE.charts[canvasId].destroy();
  var ctx = document.getElementById(canvasId);
  if (!ctx) return;
  STATE.charts[canvasId] = new Chart(ctx, {
    type: 'doughnut',
    data: { labels: labels, datasets: [{ data: data, backgroundColor: ['#16a34a', '#d97706', '#64748b', '#dc2626'] }] },
    options: { responsive: true }
  });
}

function approveFromDashboard(bookingId) {
  setLoading(true, 'กำลังบันทึกอนุมัติการจอง...');
  callGas('updateBookingStatus', STATE.token, bookingId, 'อนุมัติ', '')
    .then(function() {
      Swal.fire({ icon: 'success', title: 'อนุมัติการจองสำเร็จ!', text: 'สร้างกิจกรรมใน Google Calendar และส่งอีเมลแจ้งผู้จองเรียบร้อยแล้ว', confirmButtonColor: '#0f4c81', timer: 2000, timerProgressBar: true });
      loadDashboard();
      refreshBadgesImmediately();
    })
    .catch(function(err) {
      Swal.fire({ icon: 'error', title: 'ไม่สามารถอนุมัติได้', text: err.message, confirmButtonColor: '#0f4c81' });
    })
    .finally(function() { setLoading(false); });
}

function rejectFromDashboard(bookingId) {
  Swal.fire({
    title: 'ระบุเหตุผลที่ไม่อนุมัติ',
    input: 'textarea',
    inputPlaceholder: 'กรอกเหตุผลหรือคำชี้แจงเพิ่มเติม (ส่งทางอีเมล)...',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#dc2626',
    cancelButtonColor: '#64748b',
    confirmButtonText: 'ยืนยันไม่อนุมัติ',
    cancelButtonText: 'ยกเลิก'
  }).then(function(result) {
    if (result.isConfirmed) {
      setLoading(true, 'กำลังบันทึกข้อมูล...');
      callGas('updateBookingStatus', STATE.token, bookingId, 'ไม่อนุมัติ', result.value || '')
        .then(function() {
          Swal.fire({ icon: 'success', title: 'บันทึกสถานะไม่อนุมัติเรียบร้อย', text: 'ส่งอีเมลแจ้งผลไปยังผู้จองแล้ว', confirmButtonColor: '#0f4c81', timer: 2000 });
          loadDashboard();
          refreshBadgesImmediately();
        })
        .catch(function(err) {
          Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: err.message, confirmButtonColor: '#0f4c81' });
        })
        .finally(function() { setLoading(false); });
    }
  });
}

/* ==========================================================================
 * Standalone Approval View (Approver & Admin)
 * ======================================================================== */
function loadApprovalViewData() {
  callGas('searchBookings', STATE.token, { status: 'รออนุมัติ' })
    .then(function(res) {
      var list = res.data || [];
      updatePendingBadgeCount(list.length);

      var tbody = document.getElementById('standaloneApprovalBody');
      if (!tbody) return;

      if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--muted); padding:20px;"><i class="bi bi-check-circle" style="font-size:24px; color:#16a34a;"></i><br>ไม่มีรายการจองที่รอการอนุมัติในขณะนี้</td></tr>';
        return;
      }

      var html = '';
      list.forEach(function(b) {
        var thaiDate = formatDisplayDateThai(b.Date);
        html += '<tr>' +
          '<td><strong>' + escapeHtml(b.BookingID) + '</strong></td>' +
          '<td>' + escapeHtml(thaiDate) + '<br><small>' + escapeHtml(b.StartTime) + '–' + escapeHtml(b.EndTime) + ' น.</small></td>' +
          '<td>' + escapeHtml(b.RoomName) + '</td>' +
          '<td>' + escapeHtml(b.Topic) + '</td>' +
          '<td>' + escapeHtml(b.BookerName) + '<br><small style="color:var(--muted);">' + escapeHtml(b.Department) + '</small></td>' +
          '<td>' + b.Participants + ' คน</td>' +
          '<td style="white-space:nowrap;">' +
            '<button class="btn btn-success btn-sm" onclick="approveFromView(\'' + escapeHtml(b.BookingID) + '\')"><i class="bi bi-check-lg"></i> อนุมัติ</button> ' +
            '<button class="btn btn-danger btn-sm" onclick="rejectFromView(\'' + escapeHtml(b.BookingID) + '\')"><i class="bi bi-x-lg"></i> ไม่อนุมัติ</button> ' +
            '<button class="btn btn-light btn-sm" onclick="openBookingDetailModal(\'' + escapeHtml(b.BookingID) + '\')"><i class="bi bi-eye"></i></button>' +
          '</td></tr>';
      });
      tbody.innerHTML = html;
    })
    .catch(function(err) { showToast(err.message, 'error'); });
}

function approveFromView(bookingId) {
  setLoading(true, 'กำลังบันทึกอนุมัติการจอง...');
  callGas('updateBookingStatus', STATE.token, bookingId, 'อนุมัติ', '')
    .then(function() {
      Swal.fire({ icon: 'success', title: 'อนุมัติการจองสำเร็จ', text: 'สร้างกิจกรรมใน Google Calendar และส่งอีเมลแจ้งผู้จองเรียบร้อยแล้ว', confirmButtonColor: '#0f4c81', timer: 2200 });
      loadApprovalViewData();
      refreshBadgesImmediately();
    })
    .catch(function(err) { Swal.fire({ icon: 'error', title: 'ไม่สามารถอนุมัติได้', text: err.message, confirmButtonColor: '#0f4c81' }); })
    .finally(function() { setLoading(false); });
}

function rejectFromView(bookingId) {
  Swal.fire({
    title: 'ระบุเหตุผลที่ไม่อนุมัติ',
    input: 'textarea',
    inputPlaceholder: 'กรอกเหตุผลหรือคำชี้แจงเพิ่มเติมเพื่อให้ผู้จองทราบ...',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#dc2626',
    cancelButtonColor: '#64748b',
    confirmButtonText: 'ยืนยันไม่อนุมัติ',
    cancelButtonText: 'ยกเลิก'
  }).then(function(result) {
    if (result.isConfirmed) {
      setLoading(true, 'กำลังบันทึกข้อมูล...');
      callGas('updateBookingStatus', STATE.token, bookingId, 'ไม่อนุมัติ', result.value || '')
        .then(function() {
          Swal.fire({ icon: 'success', title: 'บันทึกสถานะไม่อนุมัติสำเร็จ', text: 'ส่งอีเมลแจ้งเหตุผลไปยังผู้จองแล้ว', confirmButtonColor: '#0f4c81', timer: 2000 });
          loadApprovalViewData();
          refreshBadgesImmediately();
        })
        .catch(function(err) { Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: err.message, confirmButtonColor: '#0f4c81' }); })
        .finally(function() { setLoading(false); });
    }
  });
}

/* ==========================================================================
 * Admin Management (6 Tabs: Approval, All Bookings, Rooms, Users, Settings, Audit)
 * ======================================================================== */
/* ==========================================================================
 * Admin Management Tabs & Panel Controller (ควบคุมการสลับแท็บในหน้าจัดการระบบ)
 * ======================================================================== */
function switchAdminTab(tabName, btnElement) {
  // 1. จัดการปุ่ม Tab เมนูย่อย
  var tabButtons = document.querySelectorAll('#view-admin .tab-btn');
  tabButtons.forEach(function(b) {
    b.classList.remove('active');
    b.classList.remove('btn-primary');
    b.classList.add('btn-outline');
  });

  if (btnElement) {
    btnElement.classList.add('active');
    btnElement.classList.remove('btn-outline');
    btnElement.classList.add('btn-primary');
  }

  // 2. ซ่อน/แสดง Panel ของแต่ละแท็บ
  var panels = document.querySelectorAll('#view-admin .tab-panel');
  panels.forEach(function(p) {
    p.style.display = 'none';
  });

  var targetPanel = document.getElementById('admin-tab-' + tabName);
  if (targetPanel) {
    targetPanel.style.display = 'block';
  }

  // 3. โหลดข้อมูลเฉพาะของแท็บนั้นๆ อัตโนมัติ
  if (tabName === 'approval' || tabName === 'allbookings') {
    if (typeof loadAdminBookings === 'function') loadAdminBookings();
  } else if (tabName === 'rooms') {
    if (typeof loadAdminRooms === 'function') loadAdminRooms();
  } else if (tabName === 'users') {
    if (typeof loadAdminUsers === 'function') loadAdminUsers();
  } else if (tabName === 'settings') {
    if (typeof loadAdminSettings === 'function') loadAdminSettings();
  } else if (tabName === 'audit') {
    if (typeof loadAdminAudit === 'function') loadAdminAudit();
  }
}

function loadAdminView() {
  var firstTabBtn = document.querySelector('#view-admin .tab-btn');
  switchAdminTab('approval', firstTabBtn);
}
/* ==========================================================================
 * Admin Settings Management (ฟังก์ชันโหลดและบันทึกการตั้งค่าระบบ)
 * ======================================================================== */
function loadAdminSettings() {
  callGas('getAdminSettings', STATE.token)
    .then(function(res) {
      var s = res.data || {};
      
      // ตั้งค่าทั่วไป
      document.getElementById('setOrgName').value = s.ORG_NAME || '';
      if (document.getElementById('setFrontendUrl')) {
        document.getElementById('setFrontendUrl').value = s.FRONTEND_URL || '';
      }
      document.getElementById('setOpenHour').value = extractCleanTime(s.OPEN_HOUR, '07:00');
      document.getElementById('setCloseHour').value = extractCleanTime(s.CLOSE_HOUR, '20:00');

      // 🟢 ตั้งค่าจำนวนรายการ Kiosk สูงสุด
      if (document.getElementById('setKioskMaxUpcoming')) {
        document.getElementById('setKioskMaxUpcoming').value = s.KIOSK_MAX_UPCOMING || '5';
      }

      // 🟢 ตั้งค่าระบบขั้นสูง (สเปกชีต, ปฏิทิน, ไดรฟ์, Webhook)
      if (document.getElementById('setSpreadsheetId')) document.getElementById('setSpreadsheetId').value = s.SPREADSHEET_ID || '';
      if (document.getElementById('setCalendarId')) document.getElementById('setCalendarId').value = s.CALENDAR_ID || '';
      if (document.getElementById('setDriveFolderId')) document.getElementById('setDriveFolderId').value = s.DRIVE_FOLDER_ID || '';
      if (document.getElementById('setChatWebhookUrl')) document.getElementById('setChatWebhookUrl').value = s.CHAT_WEBHOOK_URL || '';
      if (document.getElementById('setAdminNotifyEmail')) document.getElementById('setAdminNotifyEmail').value = s.ADMIN_NOTIFY_EMAIL || '';

      // ตั้งค่าสถานะเปิด/ปิด (Select Options)
      setSelectValue('setRequireApproval', s.REQUIRE_APPROVAL, 'TRUE');
      setSelectValue('setCalendarSync', s.ENABLE_CALENDAR_SYNC, 'TRUE');
      setSelectValue('setChatNotify', s.ENABLE_CHAT_NOTIFY, 'TRUE');
      setSelectValue('setRemind1D', s.REMINDER_1D, 'TRUE');
      setSelectValue('setRemind2H', s.REMINDER_2H, 'TRUE');
      setSelectValue('setRemind30M', s.REMINDER_30M, 'TRUE');
    })
    .catch(function(err) { showToast(err.message, 'error'); });
}

function submitAdminSettings(e) {
  e.preventDefault();
  setLoading(true, 'กำลังบันทึกการตั้งค่าระบบ...');
  
  // ฟังก์ชันช่วยดึงค่าความปลอดภัย ป้องกัน Error Reading Null
  function getSafeVal(id, defaultVal) {
    var el = document.getElementById(id);
    return (el && el.value !== undefined) ? el.value.trim() : (defaultVal || '');
  }

  var payload = {
    ORG_NAME: getSafeVal('setOrgName', 'เทศบาลเมืองสมุทรสงคราม'),
    FRONTEND_URL: getSafeVal('setFrontendUrl', ''),
    OPEN_HOUR: getSafeVal('setOpenHour', '07:00'),
    CLOSE_HOUR: getSafeVal('setCloseHour', '20:00'),
    
    // ตั้งค่า Kiosk Max Upcoming
    KIOSK_MAX_UPCOMING: getSafeVal('setKioskMaxUpcoming', '5'),

    // ค่าพารามิเตอร์ขั้นสูง (เช็กความปลอดภัยป้องกัน null)
    SPREADSHEET_ID: getSafeVal('setSpreadsheetId', ''),
    CALENDAR_ID: getSafeVal('setCalendarId', ''),
    DRIVE_FOLDER_ID: getSafeVal('setDriveFolderId', ''),
    CHAT_WEBHOOK_URL: getSafeVal('setChatWebhookUrl', ''),
    ADMIN_NOTIFY_EMAIL: getSafeVal('setAdminNotifyEmail', ''),

    // สถานะเปิด/ปิดระบบ
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
      if (orgLabel) {
        orgLabel.textContent = payload.ORG_NAME;
      }
      if (typeof updateTimeSlotOptions === 'function') {
        updateTimeSlotOptions();
      }

      Swal.fire({
        icon: 'success',
        title: 'บันทึกสำเร็จ!',
        text: 'การตั้งค่าระบบและค่าพารามิเตอร์ทั้งหมดถูกบันทึกลงฐานข้อมูลเรียบร้อยแล้ว',
        confirmButtonColor: '#0f4c81',
        timer: 2000,
        timerProgressBar: true
      });
    })
    .catch(function(err) {
      Swal.fire({
        icon: 'error',
        title: 'บันทึกไม่สำเร็จ',
        text: err.message,
        confirmButtonColor: '#0f4c81'
      });
    })
    .finally(function() {
      setLoading(false);
    });
}

function setSelectValue(elementId, val, defaultVal) {
  var el = document.getElementById(elementId);
  if (!el) return;
  var target = String(val !== undefined && val !== null ? val : defaultVal).trim().toUpperCase();
  el.value = (target === 'TRUE' || target === '1') ? 'TRUE' : 'FALSE';
}


function loadAdminBookings() {
  callGas('searchBookings', STATE.token, {})
    .then(function(res) {
      var list = res.data || [];
      var pending = list.filter(function(b) { return b.Status === 'รออนุมัติ'; });
      updatePendingBadgeCount(pending.length);

      var appBody = document.getElementById('adminApprovalBody');
      if (appBody) {
        if (pending.length === 0) {
          appBody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--muted); padding:16px;">ไม่มีรายการรออนุมัติ</td></tr>';
        } else {
          var htmlA = '';
          pending.forEach(function(b) {
            htmlA += '<tr>' +
              '<td><strong>' + escapeHtml(b.BookingID) + '</strong></td>' +
              '<td>' + escapeHtml(formatDisplayDateThai(b.Date)) + '<br><small>' + escapeHtml(b.StartTime) + '–' + escapeHtml(b.EndTime) + '</small></td>' +
              '<td>' + escapeHtml(b.RoomName) + '</td>' +
              '<td>' + escapeHtml(b.Topic) + '</td>' +
              '<td>' + escapeHtml(b.BookerName) + '<br><small>' + escapeHtml(b.Department) + '</small></td>' +
              '<td>' + b.Participants + '</td>' +
              '<td style="white-space:nowrap;">' +
              '<button class="btn btn-success btn-sm" onclick="changeBookingStatus(\'' + escapeHtml(b.BookingID) + '\',\'อนุมัติ\')"><i class="bi bi-check-lg"></i> อนุมัติ</button> ' +
              '<button class="btn btn-danger btn-sm" onclick="rejectBookingPrompt(\'' + escapeHtml(b.BookingID) + '\')"><i class="bi bi-x-lg"></i> ไม่อนุมัติ</button> ' +
              '<button class="btn btn-light btn-sm" onclick="openBookingDetailModal(\'' + escapeHtml(b.BookingID) + '\')"><i class="bi bi-eye"></i></button>' +
              '</td></tr>';
          });
          appBody.innerHTML = htmlA;
        }
      }

      var allBody = document.getElementById('adminAllBookingsBody');
      if (allBody) {
        var htmlAll = '';
        list.forEach(function(b) {
          htmlAll += '<tr>' +
            '<td><strong>' + escapeHtml(b.BookingID) + '</strong></td>' +
            '<td>' + escapeHtml(formatDisplayDateThai(b.Date)) + ' ' + escapeHtml(b.StartTime) + '–' + escapeHtml(b.EndTime) + '</td>' +
            '<td>' + escapeHtml(b.RoomName) + '</td>' +
            '<td>' + escapeHtml(b.Topic) + '</td>' +
            '<td>' + escapeHtml(b.BookerName) + '</td>' +
            '<td>' + statusBadge(b.EffectiveStatus || b.Status) + '</td>' +
            '<td><select style="width:130px; padding:4px 8px;" onchange="if(this.value){ changeBookingStatus(\'' + escapeHtml(b.BookingID) + '\', this.value); this.value=\'\'; }">' +
            '<option value="">-- เปลี่ยนสถานะ --</option><option value="อนุมัติ">อนุมัติ</option><option value="ไม่อนุมัติ">ไม่อนุมัติ</option><option value="ยกเลิก">ยกเลิก</option><option value="เสร็จสิ้น">เสร็จสิ้น</option><option value="รออนุมัติ">รออนุมัติ</option></select></td></tr>';
        });
        allBody.innerHTML = htmlAll;
      }
    })
    .catch(function(err) { showToast(err.message, 'error'); });
}

function changeBookingStatus(bookingId, newStatus, remark) {
  setLoading(true, 'กำลังอัปเดตสถานะ...');
  callGas('updateBookingStatus', STATE.token, bookingId, newStatus, remark || '')
    .then(function(res) {
      Swal.fire({ icon: 'success', title: 'อัปเดตสถานะสำเร็จ', text: res.message, confirmButtonColor: '#0f4c81', timer: 2000 });
      loadAdminBookings();
      refreshBadgesImmediately();
    })
    .catch(function(err) { Swal.fire({ icon: 'error', title: 'ไม่สามารถอัปเดตสถานะได้', text: err.message, confirmButtonColor: '#0f4c81' }); })
    .finally(function() { setLoading(false); });
}

function rejectBookingPrompt(bookingId) {
  Swal.fire({
    title: 'ระบุเหตุผลที่ไม่อนุมัติ',
    input: 'textarea',
    inputPlaceholder: 'กรอกเหตุผลหรือคำชี้แจงเพิ่มเติม (ไม่บังคับ)...',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#dc2626',
    cancelButtonColor: '#64748b',
    confirmButtonText: 'ยืนยันไม่อนุมัติ',
    cancelButtonText: 'ยกเลิก'
  }).then(function(result) {
    if (result.isConfirmed) {
      changeBookingStatus(bookingId, 'ไม่อนุมัติ', result.value || '');
    }
  });
}

function loadAdminRooms() {
  callGas('getRooms', true)
    .then(function(res) {
      var list = res.data || [];
      window._adminRoomsCache = list;
      var tbody = document.getElementById('adminRoomsBody');
      if (!tbody) return;

      var html = '';
      list.forEach(function(r) {
        html += '<tr>' +
          '<td><img src="' + escapeHtml(r.ImageURL || '') + '" style="width:54px; height:38px; object-fit:cover; border-radius:6px; background:#e2e8f0;"></td>' +
          '<td>' + escapeHtml(r.RoomID) + '</td>' +
          '<td><strong>' + escapeHtml(r.RoomName) + '</strong></td>' +
          '<td>' + escapeHtml(r.Building) + ' ' + escapeHtml(r.Floor) + '</td>' +
          '<td>' + r.Capacity + ' คน</td>' +
          '<td>' + escapeHtml(r.Status) + '</td>' +
          '<td style="white-space:nowrap;">' +
          '<button class="btn btn-outline btn-sm" onclick="openRoomModal(\'' + escapeHtml(r.RoomID) + '\')"><i class="bi bi-pencil"></i></button> ' +
          '<button class="btn btn-danger btn-sm" onclick="removeRoom(\'' + escapeHtml(r.RoomID) + '\')"><i class="bi bi-trash"></i></button>' +
          '</td></tr>';
      });
      tbody.innerHTML = html;
    })
    .catch(function(err) { showToast(err.message, 'error'); });
}

function openRoomModal(roomId) {
  STATE.pendingRoomImage = null;
  document.getElementById('roomForm').reset();
  document.getElementById('rmPreviewWrap').style.display = 'none';

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
      document.getElementById('rmResponsible').value = r.Responsible;
      document.getElementById('rmColor').value = r.Color || '#0284c7';
      document.getElementById('rmEquipment').value = r.Equipment;
      document.getElementById('rmDesc').value = r.Description;
      document.getElementById('rmImageUrl').value = r.ImageURL;
      updateRoomImagePreview(r.ImageURL);
    }
  } else {
    document.getElementById('roomModalTitle').textContent = 'เพิ่มห้องประชุมใหม่';
    document.getElementById('rmId').value = '';
  }
  openModal('roomModal');
}

function handleRoomImageSelect(e) {
  var file = e.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(ev) {
    var img = new Image();
    img.onload = function() {
      var maxW = 1200;
      var scale = img.width > maxW ? (maxW / img.width) : 1;
      var canvas = document.createElement('canvas');
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      var compressed = canvas.toDataURL('image/jpeg', 0.82);

      STATE.pendingRoomImage = { base64: compressed, fileName: file.name, mimeType: 'image/jpeg' };
      updateRoomImagePreview(compressed);
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

function updateRoomImagePreview(url) {
  var wrap = document.getElementById('rmPreviewWrap');
  var img = document.getElementById('rmPreviewImg');
  if (url) { img.src = url; wrap.style.display = 'block'; }
  else { wrap.style.display = 'none'; }
}

function submitRoomForm(e) {
  e.preventDefault();
  setLoading(true, 'กำลังบันทึกข้อมูลและรูปภาพ...');
  var payload = {
    RoomID: document.getElementById('rmId').value,
    RoomName: document.getElementById('rmName').value,
    Building: document.getElementById('rmBuilding').value,
    Floor: document.getElementById('rmFloor').value,
    Capacity: Number(document.getElementById('rmCapacity').value),
    Status: document.getElementById('rmStatus').value,
    Responsible: document.getElementById('rmResponsible').value,
    Color: document.getElementById('rmColor').value,
    Equipment: document.getElementById('rmEquipment').value,
    Description: document.getElementById('rmDesc').value,
    ImageURL: document.getElementById('rmImageUrl').value
  };
  if (STATE.pendingRoomImage) {
    payload.imageBase64 = STATE.pendingRoomImage.base64;
    payload.imageFileName = STATE.pendingRoomImage.fileName;
    payload.imageMimeType = STATE.pendingRoomImage.mimeType;
  }

  callGas('saveRoom', STATE.token, payload)
    .then(function(res) {
      showToast(res.message, 'success');
      closeModal('roomModal');
      loadAdminRooms();
      return callGas('getRooms', false);
    })
    .then(function(roomsRes) {
      STATE.rooms = roomsRes.data || [];
      populateDropdowns();
    })
    .catch(function(err) { Swal.fire({ icon: 'error', title: 'บันทึกข้อมูลห้องไม่สำเร็จ', text: err.message, confirmButtonColor: '#0f4c81' }); })
    .finally(function() { setLoading(false); });
}

function removeRoom(roomId) {
  Swal.fire({
    title: 'ยืนยันการลบห้องประชุม?',
    text: 'รหัสห้อง: ' + roomId + ' (ข้อมูลห้องจะถูกลบออกจากระบบอย่างถาวร)',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#dc2626',
    cancelButtonColor: '#64748b',
    confirmButtonText: 'ยืนยันลบห้องประชุม',
    cancelButtonText: 'ยกเลิก'
  }).then(function(result) {
    if (result.isConfirmed) {
      setLoading(true);
      callGas('deleteRoom', STATE.token, roomId)
        .then(function(res) { showToast(res.message, 'success'); loadAdminRooms(); })
        .catch(function(err) { Swal.fire({ icon: 'error', title: 'ไม่สามารถลบห้องได้', text: err.message, confirmButtonColor: '#0f4c81' }); })
        .finally(function() { setLoading(false); });
    }
  });
}

function loadAdminUsers() {
  callGas('getUsersList', STATE.token)
    .then(function(res) {
      var list = res.data || [];
      window._adminUsersCache = list;

      var pendingCount = list.filter(function(x) { return String(x.Status || '').trim() === 'รออนุมัติ'; }).length;
      updateAdminPendingBadge(pendingCount);

      var tbody = document.getElementById('adminUsersBody');
      if (!tbody) return;

      if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--muted); padding:16px;">ไม่พบข้อมูลผู้ใช้งาน</td></tr>';
        return;
      }

      var html = '';
      list.forEach(function(u) {
        var st = String(u.Status || '').trim();
        var isPending = (st === 'รออนุมัติ');
        var badgeCls = isPending ? 'badge-pending' : (st === 'ไม่อนุมัติ' ? 'badge-rejected' : (st === 'Inactive' ? 'badge-cancelled' : 'badge-approved'));
        var statusBadgeHtml = '<span class="badge ' + badgeCls + '">' + escapeHtml(st) + '</span>';

        var actionPendingBtns = isPending
          ? '<button class="btn btn-success btn-sm" onclick="approveUserAccount(\'' + escapeHtml(u.Email) + '\')"><i class="bi bi-check-lg"></i> อนุมัติ</button> ' +
            '<button class="btn btn-danger btn-sm" onclick="rejectUserAccount(\'' + escapeHtml(u.Email) + '\')"><i class="bi bi-x-lg"></i> ปฏิเสธ</button> '
          : '';

        html += '<tr>' +
          '<td>' + escapeHtml(u.Email) + '</td>' +
          '<td>' + escapeHtml(u.Name) + (u.Phone ? '<br><small style="color:var(--muted);"><i class="bi bi-telephone"></i> ' + escapeHtml(u.Phone) + '</small>' : '') + '</td>' +
          '<td>' + escapeHtml(u.Department || '-') + '</td>' +
          '<td><span class="badge badge-completed">' + escapeHtml(u.Role) + '</span></td>' +
          '<td>' + statusBadgeHtml + '</td>' +
          '<td style="white-space:nowrap;">' +
            actionPendingBtns +
            '<button class="btn btn-outline btn-sm" onclick="openUserModal(\'' + escapeHtml(u.Email) + '\')"><i class="bi bi-pencil"></i></button> ' +
            '<button class="btn btn-danger btn-sm" onclick="removeUser(\'' + escapeHtml(u.Email) + '\')"><i class="bi bi-trash"></i></button>' +
          '</td></tr>';
      });
      tbody.innerHTML = html;
    })
    .catch(function(err) { showToast(err.message, 'error'); });
}

function approveUserAccount(email) {
  setLoading(true, 'กำลังอนุมัติบัญชีและส่งอีเมลแจ้งเตือน...');
  callGas('updateUserStatus', STATE.token, email, 'Active', '')
    .then(function(res) {
      Swal.fire({ icon: 'success', title: 'อนุมัติบัญชีสำเร็จ!', text: res.message || 'เปิดใช้งานบัญชีเรียบร้อยแล้ว', confirmButtonColor: '#0f4c81', timer: 2200 });
      loadAdminUsers();
      refreshBadgesImmediately();
    })
    .catch(function(err) { Swal.fire({ icon: 'error', title: 'ไม่สามารถอนุมัติได้', text: err.message, confirmButtonColor: '#0f4c81' }); })
    .finally(function() { setLoading(false); });
}

function rejectUserAccount(email) {
  Swal.fire({
    title: 'ปฏิเสธคำขอลงทะเบียนบัญชี?',
    text: 'อีเมล: ' + email,
    input: 'textarea',
    inputPlaceholder: 'ระบุเหตุผลที่ไม่อนุมัติ (ส่งทางอีเมลแจ้งผู้สมัคร - ไม่บังคับ)...',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#dc2626',
    cancelButtonColor: '#64748b',
    confirmButtonText: 'ยืนยันปฏิเสธและส่งอีเมล',
    cancelButtonText: 'ยกเลิก'
  }).then(function(result) {
    if (result.isConfirmed) {
      setLoading(true, 'กำลังบันทึกและส่งอีเมลแจ้งผล...');
      callGas('updateUserStatus', STATE.token, email, 'ไม่อนุมัติ', result.value || '')
        .then(function(res) {
          Swal.fire({ icon: 'success', title: 'ดำเนินการเรียบร้อย', text: res.message, confirmButtonColor: '#0f4c81', timer: 2200 });
          loadAdminUsers();
          refreshBadgesImmediately();
        })
        .catch(function(err) { Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: err.message, confirmButtonColor: '#0f4c81' }); })
        .finally(function() { setLoading(false); });
    }
  });
}

function openUserModal(email) {
  document.getElementById('userForm').reset();
  document.getElementById('usrEmail').readOnly = Boolean(email);
  if (email && window._adminUsersCache) {
    var u = window._adminUsersCache.find(function(x) { return x.Email === email; });
    if (u) {
      document.getElementById('usrEmail').value = u.Email;
      document.getElementById('usrName').value = u.Name;
      document.getElementById('usrDept').value = u.Department;
      document.getElementById('usrRole').value = u.Role;
      document.getElementById('usrStatus').value = u.Status;
      if (document.getElementById('usrPhone')) document.getElementById('usrPhone').value = u.Phone || '';
    }
  }
  openModal('userModal');
}

function submitUserForm(e) {
  e.preventDefault();
  setLoading(true);
  var payload = {
    Email: document.getElementById('usrEmail').value,
    Name: document.getElementById('usrName').value,
    Department: document.getElementById('usrDept').value,
    Role: document.getElementById('usrRole').value,
    Status: document.getElementById('usrStatus').value,
    Passcode: document.getElementById('usrPasscode').value
  };
  if (document.getElementById('usrPhone')) {
    payload.Phone = document.getElementById('usrPhone').value.trim();
  }

  callGas('saveUser', STATE.token, payload)
    .then(function(res) {
      showToast(res.message, 'success');
      closeModal('userModal');
      loadAdminUsers();
      refreshBadgesImmediately();
    })
    .catch(function(err) { Swal.fire({ icon: 'error', title: 'บันทึกข้อมูลผู้ใช้ไม่สำเร็จ', text: err.message, confirmButtonColor: '#0f4c81' }); })
    .finally(function() { setLoading(false); });
}

function removeUser(email) {
  Swal.fire({
    title: 'ยืนยันลบผู้ใช้งาน?',
    text: 'อีเมล: ' + email + ' จะถูกลบออกจากระบบอย่างถาวร',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#dc2626',
    cancelButtonColor: '#64748b',
    confirmButtonText: 'ยืนยันลบผู้ใช้',
    cancelButtonText: 'ยกเลิก'
  }).then(function(result) {
    if (result.isConfirmed) {
      setLoading(true);
      callGas('deleteUser', STATE.token, email)
        .then(function(res) { showToast(res.message, 'success'); loadAdminUsers(); refreshBadgesImmediately(); })
        .catch(function(err) { Swal.fire({ icon: 'error', title: 'ไม่สามารถลบผู้ใช้งานได้', text: err.message, confirmButtonColor: '#0f4c81' }); })
        .finally(function() { setLoading(false); });
    }
  });
}
function loadAdminAudit() {
  callGas('getAuditLogs', STATE.token, 100)
    .then(function(res) {
      var list = res.data || [];
      var tbody = document.getElementById('adminAuditBody');
      if (!tbody) return;

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
    .catch(function(err) { showToast(err.message, 'error'); });
}
// ตัวแปรเก็บข้อมูลดิบสำหรับ Live Search ในหน้าอนุมัติ
  var windowApprovalCache = [];

  function loadApprovalViewData() {
    callGas('searchBookings', STATE.token, { status: 'รออนุมัติ' })
      .then(function(res) {
        var list = res.data || [];
        windowApprovalCache = list; // เก็บใส่ Cache ชั่วคราวสำหรับกรอง
        updatePendingBadgeCount(list.length);

        // เติมตัวเลือกห้องประชุมใน Dropdown ตัวกรอง
        var roomFilter = document.getElementById('approvalRoomFilter');
        if (roomFilter && STATE.rooms) {
          var curVal = roomFilter.value;
          var rOpts = '<option value="">ทุกห้องประชุม</option>';
          STATE.rooms.forEach(function(r) {
            rOpts += '<option value="' + escapeHtml(r.RoomName) + '">' + escapeHtml(r.RoomName) + '</option>';
          });
          roomFilter.innerHTML = rOpts;
          roomFilter.value = curVal;
        }

        renderApprovalTable(list);
      })
      .catch(function(err) { showToast(err.message, 'error'); });
  }

  function renderApprovalTable(list) {
    var tbody = document.getElementById('standaloneApprovalBody');
    if (!tbody) return;

    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--muted); padding:20px;"><i class="bi bi-check-circle" style="font-size:24px; color:#16a34a;"></i><br>ไม่พบรายการจองที่รอการอนุมัติ</td></tr>';
      return;
    }

    var html = '';
    list.forEach(function(b) {
      var thaiDate = formatDisplayDateThai(b.Date);
      html += '<tr>' +
        '<td><strong>' + escapeHtml(b.BookingID) + '</strong></td>' +
        '<td>' + escapeHtml(thaiDate) + '<br><small>' + escapeHtml(b.StartTime) + '–' + escapeHtml(b.EndTime) + ' น.</small></td>' +
        '<td>' + escapeHtml(b.RoomName) + '</td>' +
        '<td>' + escapeHtml(b.Topic) + '</td>' +
        '<td>' + escapeHtml(b.BookerName) + '<br><small style="color:var(--muted);">' + escapeHtml(b.Department) + '</small></td>' +
        '<td>' + b.Participants + ' คน</td>' +
        '<td style="white-space:nowrap;">' +
          '<button class="btn btn-success btn-sm" onclick="approveFromView(\'' + escapeHtml(b.BookingID) + '\')"><i class="bi bi-check-lg"></i> อนุมัติ</button> ' +
          '<button class="btn btn-danger btn-sm" onclick="rejectFromView(\'' + escapeHtml(b.BookingID) + '\')"><i class="bi bi-x-lg"></i> ไม่อนุมัติ</button> ' +
          '<button class="btn btn-light btn-sm" onclick="openBookingDetailModal(\'' + escapeHtml(b.BookingID) + '\')"><i class="bi bi-eye"></i></button>' +
        '</td></tr>';
    });
    tbody.innerHTML = html;
  }

  // ฟังก์ชันกรองข้อมูลแบบ Live Search ทันทีที่พิมพ์หรือเลือกห้อง
  function filterApprovalTable() {
    var query = (document.getElementById('approvalSearchQuery').value || '').toLowerCase().trim();
    var roomNameFilter = (document.getElementById('approvalRoomFilter').value || '').trim();

    var filtered = windowApprovalCache.filter(function(b) {
      if (roomNameFilter && String(b.RoomName || '').trim() !== roomNameFilter) {
        return false;
      }
      if (query) {
        var textMatch = [
          b.BookingID, b.Topic, b.BookerName, b.Department, b.RoomName, b.UserEmail
        ].join(' ').toLowerCase();
        if (textMatch.indexOf(query) === -1) return false;
      }
      return true;
    });

    renderApprovalTable(filtered);
  }
