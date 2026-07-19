// IST (Asia/Kolkata) date helpers. The business timezone is IST; `date` columns
// are tz-naive, so we compute day boundaries in IST here and pass explicit
// YYYY-MM-DD strings to SQL rather than relying on the DB server's CURDATE().
const IST = 'Asia/Kolkata';

/** Current (or given) date as YYYY-MM-DD in IST. 'en-CA' formats as ISO date. */
function istDateString(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: IST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** YYYY-MM-DD for `days` before the given IST day (default today). */
function istDateStringMinus(days, from = new Date()) {
  const base = new Date(`${istDateString(from)}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() - days);
  return base.toISOString().slice(0, 10);
}

/** First day of the current IST month as YYYY-MM-DD. */
function istMonthStart(from = new Date()) {
  return `${istDateString(from).slice(0, 7)}-01`;
}

module.exports = { IST, istDateString, istDateStringMinus, istMonthStart };
