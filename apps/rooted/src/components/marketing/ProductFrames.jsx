// Drawn product previews for the landing page: a browser frame, a phone
// frame and the four role panels. They are illustrations, not screenshots, and
// every figure in them is the seeded demo school's real number for one day
// (Test School, Fri 21 Aug 2026 — docs/mobile-ui/20-dashboard-approved.html), so
// nothing here is invented. Labels go through `t()`; the numbers and the two
// seeded student names do not translate.
//
// Swap for real screenshots when they exist — the call sites only need an
// element with the same footprint.

const TREND = [46, 47, 56, 52, 59, 55, 55];

function Att({ t }) {
  return (
    <div className="att">
      <div className="bad">
        <b>{t('landing.demo.defaulters')}</b>
        <small>{t('landing.demo.overdue')}</small>
      </div>
      <div className="warn">
        <b>{t('landing.demo.leave')}</b>
        <small>{t('landing.demo.leaveOldest')}</small>
      </div>
      <div className="warn">
        <b>{t('landing.demo.absent')}</b>
        <small>{t('landing.demo.absentOf')}</small>
      </div>
    </div>
  );
}

export function BrowserDashboard({ t }) {
  const nav = ['dashboard', 'academics', 'staff', 'fee', 'expense', 'inventory'];
  return (
    <div className="app" aria-hidden="true">
      <div className="bar">
        <i></i>
        <i></i>
        <i></i>
        <span className="url">rooted.app/dashboard</span>
      </div>
      <div className="body">
        <div className="side">
          <b>
            <img src="/favicon.svg" alt="" />
            RootEd
          </b>
          {nav.map((k, i) => (
            <span key={k} className={i === 0 ? 'on' : undefined}>
              {t(`landing.demo.nav.${k}`)}
            </span>
          ))}
        </div>
        <div className="main">
          <div>
            <h4>{t('landing.demo.greeting')}</h4>
            <p className="sub">
              {t('landing.demo.school')} · {t('landing.demo.date')}
            </p>
          </div>
          <Att t={t} />
          <div className="kpis">
            <div>
              <small>{t('landing.demo.attendanceToday')}</small>
              <b>90.5%</b>
            </div>
            <div>
              <small>{t('landing.demo.feeCollected')}</small>
              <b>66.2%</b>
            </div>
            <div>
              <small>{t('landing.demo.avgScore')}</small>
              <b>74.6%</b>
            </div>
            <div>
              <small>{t('landing.demo.staffPresent')}</small>
              <b>94.6%</b>
            </div>
          </div>
          <div className="trend">
            <div className="hd">
              <span>
                <b>90.5%</b>
                {t('landing.demo.trend')}
              </span>
              <span>13 – 21 Aug</span>
            </div>
            <div className="bars">
              {TREND.map((h, i) => (
                <span key={i} style={{ height: `${h}%` }}></span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PhoneTabs({ t, active }) {
  return (
    <div className="tabbar">
      {['Home', 'Classes', 'Fees', 'More'].map((k) => (
        <span key={k} className={k === active ? 'on' : undefined}>
          {t(`landing.demo.tab${k}`)}
        </span>
      ))}
    </div>
  );
}

// `home` = principal dashboard; `roll` = a teacher's Grade 5-A attendance.
// `compact` is the short hero/mobile variant.
export function PhonePreview({ t, variant = 'home', compact = false }) {
  if (variant === 'roll') {
    return (
      <div className="phone-mini" aria-hidden="true">
        <div className="scr">
          <div>
            <h5>Grade 5-A</h5>
            <p className="sub">
              {t('landing.demo.attendance')} · {t('landing.demo.dateShort')}
            </p>
          </div>
          <div className="row">
            <div>
              <b>Chetan Shetty</b>
              <small>{t('landing.demo.rollCall')}</small>
            </div>
            <span className="chip a">{t('landing.demo.absentChip')}</span>
          </div>
          <div className="row">
            <div>
              <b>Heena Malhotra</b>
              <small>{t('landing.demo.rollCall')}</small>
            </div>
            <span className="chip l">{t('landing.demo.lateChip')}</span>
          </div>
          <div className="row">
            <div>
              <b>{t('landing.demo.others')}</b>
              <small>{t('landing.demo.markedPresent')}</small>
            </div>
            <span className="chip p">19</span>
          </div>
          <PhoneTabs t={t} active="Classes" />
        </div>
      </div>
    );
  }
  return (
    <div className="phone-mini" aria-hidden="true">
      <div className="scr">
        <div>
          <h5>{t('landing.demo.greeting')}</h5>
          <p className="sub">
            {t('landing.demo.school')} · {t('landing.demo.dateShort')}
          </p>
        </div>
        <div className="row">
          <div>
            <b>{t('landing.demo.defaulters')}</b>
            <small>{t('landing.demo.overdue')}</small>
          </div>
          ›
        </div>
        {!compact && (
          <div className="row">
            <div>
              <b>{t('landing.demo.leave')}</b>
              <small>{t('landing.demo.leaveOldest')}</small>
            </div>
            ›
          </div>
        )}
        <div className="row">
          <div>
            <b>{t('landing.demo.absent')}</b>
            <small>{t('landing.demo.absentOfShort')}</small>
          </div>
          ›
        </div>
        <div className="k">
          <div>
            <small>{t('landing.demo.attendance')}</small>
            <b>90.5%</b>
          </div>
          <div>
            <small>{t('landing.demo.feeCollected')}</small>
            <b>66.2%</b>
          </div>
        </div>
        {!compact && <PhoneTabs t={t} active="Home" />}
      </div>
    </div>
  );
}

// The small card shown beside each role's description.
export function RolePanel({ id, t }) {
  const title = t(`landing.roles.${id}.panelTitle`);
  let sub = `${t('landing.demo.school')} · ${t('landing.demo.date')}`;
  let body;

  if (id === 'principal') {
    body = (
      <div className="att one">
        <div className="bad">
          <b>{t('landing.demo.defaulters')}</b>
          <small>{t('landing.demo.overdue')}</small>
        </div>
        <div className="warn">
          <b>{t('landing.demo.leavePending')}</b>
          <small>{t('landing.demo.leaveOldest')}</small>
        </div>
        <div className="warn">
          <b>{t('landing.demo.absentPending')}</b>
          <small>{t('landing.demo.absentOfShort')}</small>
        </div>
      </div>
    );
  } else if (id === 'teacher') {
    sub = `${t('landing.demo.date')} · ${t('landing.demo.presentCount')}`;
    body = (
      <div className="roster">
        <div>
          <span>Chetan Shetty</span>
          <span className="chip a">{t('landing.demo.absentChip')}</span>
        </div>
        <div>
          <span>Heena Malhotra</span>
          <span className="chip l">{t('landing.demo.lateChip')}</span>
        </div>
        <div>
          <span>{t('landing.demo.otherStudents')}</span>
          <span className="chip p">{t('landing.demo.presentChip')}</span>
        </div>
      </div>
    );
  } else if (id === 'accountant') {
    sub = t('landing.demo.academicYear');
    body = (
      <>
        <div className="kpis two">
          <div>
            <small>{t('landing.demo.feeCollected')}</small>
            <b>66.2%</b>
          </div>
          <div>
            <small>{t('landing.demo.overdue')}</small>
            <b>₹29.41L</b>
          </div>
        </div>
        <div className="att one">
          <div className="bad">
            <b>{t('landing.demo.defaulters')}</b>
            <small>{t('landing.demo.openList')}</small>
          </div>
        </div>
      </>
    );
  } else {
    sub = t('landing.demo.onlyYours');
    body = (
      <div className="att one">
        {['myAttendance', 'myGrades', 'myReportCards'].map((k) => (
          <div key={k}>
            <b>{t(`landing.demo.${k}`)}</b>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="app" aria-hidden="true">
      <div className="main">
        <div>
          <h4>{title}</h4>
          <p className="sub">{sub}</p>
        </div>
        {body}
      </div>
    </div>
  );
}
