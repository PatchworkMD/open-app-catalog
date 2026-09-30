// Exercise the actual category/filter/card functions without a browser or network.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('site/app.js', 'utf8');
const controls = {
  search:{value:''}, category:{value:''}, sort:{value:''},
  viewer:{open:false,classList:{remove() {}},showModal() { this.open = true; }},
  viewerTitle:{}, viewerContent:{}
};
const apps = Array.from({length:100}, (_, i) => ({
  id:String(i + 1), name:`App ${String(i + 1).padStart(3, '0')}`,
  category:'One', chartRank:i + 1, assetIds:[],
  chartMemberships:[{id:'one',name:'One',rank:i + 1},{id:'two',name:'Two',rank:100 - i}]
}));
const context = vm.createContext({
  data:{apps,screens:[],coverage:{rankBasis:'original-category-feed'}},
  $:selector => controls[selector.slice(1)],
  esc:String, appIcon:() => '', media:() => '', sourceLink:() => '',
  board:[], selected:new Set(), openScreens:(...args) => { context.screenArgs = args; }
});
vm.runInContext(source.slice(source.indexOf('function itemCategories('), source.indexOf('function currentItems(')), context);
vm.runInContext(source.slice(source.indexOf('function screenCard('), source.indexOf('function screenIds(')), context);
vm.runInContext('let viewerState = null;\n' + source.slice(source.indexOf('function view('), source.indexOf('function viewCollection(')), context);
const ids = records => Array.from(records, x => x.id);
assert.equal(context.filtered(apps).length, 100, 'all apps remain unique');
assert.deepEqual(Array.from(context.itemCategories(apps[0])), ['One','Two'], 'secondary category is discoverable');
controls.category.value = 'Two';
assert.deepEqual(ids(context.filtered(apps)), apps.map(a => a.id).reverse(), '100 overlapping apps sort by second chart rank');
assert.match(context.appCard(apps[99]), /#1 in Two/);
assert.match(context.appCard(apps[0]), /#100 in Two/);
controls.sort.value = 'name';
assert.deepEqual(ids(context.filtered(apps)), apps.map(a => a.id));
controls.sort.value = '';
controls.category.value = 'One';
assert.deepEqual(ids(context.filtered(apps)), apps.map(a => a.id));
assert.match(context.appCard(apps[0]), /#1 in One/);
controls.category.value = '';
controls.search.value = 'two';
assert.equal(context.filtered(apps).length, 100, 'search includes secondary membership');
controls.search.value = '';
const legacy = [{id:'legacy',name:'Legacy',category:'Old',chartRank:7,assetIds:[]}];
controls.category.value = 'Old';
assert.deepEqual(ids(context.filtered(legacy)), ['legacy']);
assert.match(context.appCard(legacy[0]), /#7 in Old/);
controls.category.value = 'Two';
assert.equal(context.filtered(legacy).length, 0);
assert.equal(context.filtered([{id:'screen',category:'One',categories:['One','Two']}]).length, 1);
const screen = {id:'screen',title:'Shared screen',category:'One',categories:['One','Two']};
assert.match(context.screenCard(screen), /class="pinmeta">Two<\/span>/);
context.data.screens = [screen];
apps[0].assetIds = ['screen'];
context.openApp(apps[0]);
assert.match(controls.viewerContent.innerHTML, /class="coverage">Two · 1 listing screenshot/);
context.view('screen');
assert.equal(context.screenArgs[3], 'Two · App Store listing screenshots');
controls.category.value = 'Unrelated';
assert.match(context.screenCard(screen), /class="pinmeta">One<\/span>/);
context.openApp(legacy[0]);
assert.match(controls.viewerContent.innerHTML, /class="coverage">Old · 0 listing screenshots/);
console.log('PASS: selected category labels on screens and app details; 100 overlapping apps in each chart; selected-category rank/order; name sort; search; legacy snapshots; shared screens');
