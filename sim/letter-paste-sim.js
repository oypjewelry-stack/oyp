/* Lettered JO paste. Each PhotoFast FIND is quoted once from paste/PhotoFast.gs.
   JobSync.gs.txt is only jobParse_, so that patch has no FIND. Run: node sim/letter-paste-sim.js */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
let failed = 0;
function eq(cond, msg) { if (!cond) { failed++; console.error('FAIL', msg); } else console.log('ok', msg); }

function blocks(text) {
  const parts = text.split(/\nFIND\n/);
  const out = [];
  for (let i = 1; i < parts.length; i++) {
    const cut = parts[i].split(/\nREPLACE WITH\n/);
    if (cut.length !== 2) throw new Error('patch block ' + i + ' has no REPLACE WITH');
    out.push([cut[0].replace(/\n$/, ''), cut[1].replace(/\n$/, '')]);
  }
  return out;
}
function apply(src, patch) {
  blocks(patch).forEach(([find, repl], i) => {
    const n = src.split(find).length - 1;
    eq(n === 1, 'FIND ' + (i + 1) + ' matches once (' + n + ')');
    src = src.replace(find, () => repl);
  });
  blocks(patch).forEach(([find, repl], i) => {
    const left = src.split(find).length - 1;
    const inside = repl.split(find).length - 1;
    eq(left === inside, 'FIND ' + (i + 1) + ' is not left behind (' + left + ' vs ' + inside + ')');
  });
  return src;
}

const photo = read('paste/PhotoFast.gs');
const photoPatch = read('paste/PhotoFast.gs.letter.patch.txt');
const jobPatch = read('paste/JobSync.gs.letter.patch.txt');
const jobSrc = read('paste/JobSync.gs.txt');
eq(blocks(photoPatch).length === 5, 'PhotoFast patch has five FIND blocks');
eq(!/\nFIND\n/.test(jobPatch), 'JobSync patch does not invent a FIND');
eq(jobSrc.includes('function jobParse_(') && !jobSrc.includes('function jobKey_('), 'JobSync.gs.txt is only jobParse_');
eq(jobPatch.includes('Do not change jobParse_'), 'the JobSync paste leaves jobParse_ alone');
blocks(photoPatch).forEach(([find], i) => eq(photo.split(find).length === 2, 'PhotoFast FIND ' + (i + 1) + ' is quoted from PhotoFast.gs'));

const patched = apply(photo, photoPatch);
const box = {
  jobKey_: s => String(s || '').toUpperCase().replace(/(\d{2}-\d{3,4})[A-Z]?$/, '$1'),
  normJO_: s => String(s || '').toUpperCase().replace(/(\d{2}-\d{3,4})[A-Z]?$/, '$1')
};
vm.createContext(box);
vm.runInContext(patched, box, { filename: 'PhotoFast.gs' });
eq(box.pfKey_('26-380B') === '26-380B', 'pfKey_ keeps 26-380B even when jobKey_ strips it');
eq(box.pfKey_('26-380') === '26-380', 'pfKey_ keeps a base JO');
eq(box.pfKey_('26-380b') === '26-380B', 'pfKey_ uppercases the letter');
const bCard = box.pfCardParts_('26-380B', '26-380B-2a.jpg');
const bMiss = box.pfCardParts_('26-380', '26-380B-2a.jpg');
const baseCard = box.pfCardParts_('26-380', '26-380-2A.JPG');
eq(bCard && bCard.page === 2 && bCard.side === 'a', '26-380B matches 26-380B-2a.jpg');
eq(bMiss === null, '26-380 does not match 26-380B-2a.jpg');
eq(baseCard && baseCard.page === 2 && baseCard.side === 'a', '26-380 still matches 26-380-2a.jpg');
eq(box.pfCardParts_('26-380B', 'CHECK-26-380B-2a.jpg') === null, 'a CHECK file is still not a card');
function file(name) {
  return { getId: () => 'id-' + name, getName: () => name, getMimeType: () => 'image/jpeg', isTrashed: () => false };
}
eq(box.pfFileOk_(file('26-380B-2a.jpg'), {}, '26-380B') === false, 'a card scan is not a profile photo');
eq(box.pfFileOk_(file('26-380B-p1.jpg'), {}, '26-380') === true, '26-380B-p1 is not 26-380\'s product file');
eq(box.pfFileOk_(file('26-380B-p1.jpg'), {}, '26-380B') === false, '26-380B-p1 belongs to 26-380B');
eq(box.pfFileOk_(file('ring.jpg'), {}, '26-380B') === true, 'a real product photo stays');

const js = {};
vm.createContext(js);
vm.runInContext(jobPatch.slice(jobPatch.indexOf('function jobKey_')), js, { filename: 'JobSync.gs.letter.patch.txt' });
eq(js.jobKey_('26-380B') === '26-380B' && js.jobKey_('26-380') === '26-380', 'jobKey_ keeps the trailing letter');
eq(js.jobKey_('26-380b') === '26-380B', 'jobKey_ uppercases a lettered JO');
const siblings = js.jobMergeVersions_([
  { jo: '26-380', type: 'new', client: 'Ada' },
  { jo: '26-380B', type: 'new', client: 'Bea' }
]);
eq(siblings.map(r => r.jo).sort().join() === '26-380,26-380B', 'sibling jobs stay their own rows');
eq(siblings.find(r => r.jo === '26-380B').client === 'Bea', 'the lettered sibling keeps its client');
const revised = js.jobMergeVersions_([
  { jo: '26-380', type: 'new', client: 'Ada' },
  { jo: '26-380A', type: 'revision', client: 'Ada A' },
  { jo: '26-380B', type: 'revision', client: 'Ada B' }
]);
eq(revised.length === 1 && revised[0].jo === '26-380' && revised[0].version === 'B' && revised[0].client === 'Ada B', 'only true revisions merge, and the highest letter wins');
const parented = js.jobMergeVersions_([
  { jo: '26-380', type: 'new', client: 'Ada' },
  { jo: '26-380C', type: 'repair', parent_jo: '26-380', client: 'Child' }
]);
eq(parented.length === 1 && parented[0].jo === '26-380' && parented[0].client === 'Child', 'a parent_jo row merges onto that base');
const rows = [{ jo: '26-380', client: 'Ada' }, { jo: '26-380B', client: 'Bea' }];
eq(js.jobRowFor_(rows, '26-380B').client === 'Bea', 'a save for 26-380B finds that row');
eq(js.jobRowFor_(rows, '26-380').client === 'Ada', 'a save for 26-380 finds the base row');
eq(js.jobRowFor_([{ jo: '26-380', client: 'Ada' }], '26-380B') === null, 'a missing lettered row does not fall back to the base');

if (failed) { console.error(failed + ' failed'); process.exit(1); }
console.log('letter paste ok');
