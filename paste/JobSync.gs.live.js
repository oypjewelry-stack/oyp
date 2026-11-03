/* NOT A PASTE. Reconstructed excerpt of live JobSync.gs after the Nov 3 job-type paste
   (jobEnsureExtraCols_ and jobExtraSkip_). The real JobSync.gs is not in this repo.
   paste/JobSync.gs.itemkind.patch.txt is checked against this file. */
var JOB_ITEM_TYPES = [
  ['jewelry', 'Jewelry', ['metal', 'karat']],
  ['loose_stone', 'Loose stone', ['stone_type', 'stone_size', 'grade']],
  ['pearl', 'Pearl', ['stone_type', 'stone_size']],
  ['raw_material', 'Raw material', ['material', 'weight_g']],
  ['other', 'Other', []]
];

function jobItemTypes_() {
  var rows = JOB_ITEM_TYPES.slice(), extra = [], raw = '', i;
  try { raw = PropertiesService.getScriptProperties().getProperty('item_types_extra') || ''; } catch (e0) { raw = ''; }
  try { extra = raw ? JSON.parse(raw) : []; } catch (e1) { extra = []; }
  if (!extra || !extra.length) extra = [];
  var other = rows.pop();
  for (i = 0; i < extra.length; i++) if (extra[i] && extra[i][0]) rows.push(extra[i]);
  rows.push(other);
  return rows;
}

function jobEnsureExtraCols_() {
  var sh = ss_().getSheetByName('JobOrders');
  var out = { source: 'source', jor: 'jor' };
  if (!sh || typeof jobHeader_ !== 'function') return out;
  var header = jobHeader_(sh) || [];
  var low = header.map(function (h) { return String(h || '').trim().toLowerCase(); });
  function has(name) { return low.indexOf(name) >= 0; }
  var names = ['jor', 'jor_no', 'jor_number', 'jor#'], i, col = '';
  for (i = 0; i < names.length; i++) if (has(names[i])) { col = names[i]; break; }
  var last = header.length;
  if (!has('source')) { last++; sh.getRange(1, last).setValue('source'); }
  if (!col) { last++; sh.getRange(1, last).setValue('jor'); col = 'jor'; }
  out.jor = col;
  return out;
}

function jobExtraSkip_(set, cols) {
  var sh = ss_().getSheetByName('JobOrders');
  var header = (sh && typeof jobHeader_ === 'function') ? (jobHeader_(sh) || []) : [];
  var low = header.map(function (h) { return String(h || '').trim().toLowerCase(); });
  var skipped = [];
  cols = cols || { source: 'source', jor: 'jor' };
  if (set && Object.prototype.hasOwnProperty.call(set, 'source') && low.indexOf('source') < 0) skipped.push('source');
  if (set && Object.prototype.hasOwnProperty.call(set, 'jor') && low.indexOf(String(cols.jor || 'jor').toLowerCase()) < 0) skipped.push('jor');
  return skipped;
}
