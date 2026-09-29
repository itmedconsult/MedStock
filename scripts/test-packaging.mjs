import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

class Sheet {
  constructor(name, rows) { this.name = name; this.rows = structuredClone(rows); }
  getName() { return this.name; }
  getLastRow() { return this.rows.length; }
  getLastColumn() { return Math.max(...this.rows.map(row => row.length)); }
  getMaxRows() { return 1000; }
  getMaxColumns() { return 26; }
  getRangeList(addresses) {
    return {setValue: value => addresses.forEach(address => {
      const [,letters,row] = address.match(/^([A-Z]+)(\d+)$/);
      const column = [...letters].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0);
      this.getRange(Number(row),column).setValue(value);
    })};
  }
  getRange(r, c, h = 1, w = 1) {
    const sheet = this;
    const range = {
      getValues: () => Array.from({length: h}, (_, y) => Array.from({length: w}, (_, x) => sheet.rows[r+y-1]?.[c+x-1] ?? '')),
      getDisplayValues: () => range.getValues().map(row => row.map(String)),
      setValues: values => { values.forEach((row, y) => { sheet.rows[r+y-1] ??= []; row.forEach((v, x) => {
        if (sheet.name === 'Log Data' && c+x-1 === 7 && v && !['IMPORT','STOCK IN','STOCK OUT','SALE','CHECK STOCK','ADJUSTMENT','OPEN','USED UP','TRANSFER','RETURN','EXPIRED','DAMAGED'].includes(String(v).toUpperCase())) {
          throw new Error(`The data entered in Action violates the data validation rules: ${v}`);
        }
        sheet.rows[r+y-1][c+x-1] = v;
      }); }); return range; },
      setValue: v => range.setValues([[v]]),
      copyTo: () => {}, clearContent: () => range.setValues(Array.from({length:h},()=>Array(w).fill(''))),
      setNumberFormat: () => range,
    };
    return range;
  }
}

const inventoryHeader = ['Unique ID','SKU','Product Name','Category','Unit','Lot','Expiry Date','Location','Status','Qty','Barcode Value','Received / Count Date','Notes','Stock Type','Initial Qty','Opened At','Updated At','Used Up At','Source Reference','Updated By','Track Mode','Data Set'];
const logHeader = ['Timestamp','Transaction ID','Unique ID','SKU','Product Name','Lot','Expiry Date','Action','Qty Change','Location','Staff','Reference / Note','Qty Before','Qty After','Stock Type','Stock Group','Source','Details'];
const registryHeader = ['Issued At','Batch ID','Barcode','SKU','Product Name','Barcode Date','Run Code','Unit','Track Mode','Status','Request ID','Request Snapshot','Branch','Source'];
function setup(size = 5, unit = 'Bottle') {
  const barcode = 'AES-038-240926-A9001';
  const sheets = {
    'Product List': new Sheet('Product List', [[],['AES-038','LITE','Meso','LiteActiv',unit,'BULK',5,'YES','AES','',5,5,'Box',size]]),
    Inventory: new Sheet('Inventory', [inventoryHeader]),
    'Log Data': new Sheet('Log Data', [logHeader]),
    BC_Registry: new Sheet('BC_Registry', [registryHeader,[new Date(),'BATCH',barcode,'AES-038','LiteActiv',new Date(),'A9001',unit,'BULK','ISSUED','REQ','','Thonglor','WEB']]),
  };
  const ss = { getSheetByName: name => sheets[name], getSpreadsheetTimeZone: () => 'Asia/Bangkok' };
  let seq = 0;
  const ctx = vm.createContext({console, Date, LockService: {getDocumentLock: () => ({waitLock(){}, releaseLock(){}})}, Session: {getActiveUser: () => ({getEmail: () => 'test'})}, SpreadsheetApp: {flush(){}, CopyPasteType:{PASTE_FORMAT:1}}, Utilities: {getUuid: () => String(++seq).padStart(6,'0'),formatDate: (value, _zone, format) => format === 'yyyy-MM-dd' ? value.toISOString().slice(0,10) : '20260924-180000'}});
  for (const file of ['Packaging.gs','StockOperationsApi.gs','WebApi.gs']) vm.runInContext(fs.readFileSync(`google-apps-script/${file}`,'utf8'),ctx);
  const imp = quantity => ctx.medStockImportBatch_({branch:'Thonglor',receivedDate:'2026-09-24',items:[{barcode,lot:'2026-09-24',expiry:'2028-09-24',quantity}]},ss);
  const cut = (quantity, mode = 'PARTIAL', reason = 'USE') => ctx.medStockCutStockBatch_({branch:'Thonglor',items:[{id:barcode,cutReason:reason,cutMode:mode,cutQuantity:quantity}]},ss);
  const refund = (transactionId, quantity, confirmed = true) => ctx.medStockRefundStockBatch_({branch:'Thonglor',items:[{transactionId,refundQuantity:quantity,restockableConfirmed:confirmed}]},ss);
  return {ctx,ss,sheets,barcode,imp,cut,refund};
}

for (const [size,unit] of [[5,'Bottle'],[10,'Bottle'],[2,'Syringe'],[1,'Syringe']]) {
  const t = setup(size,unit);
  assert.throws(() => t.imp(size+1), /full container/);
  assert.equal(t.sheets.Inventory.getLastRow(),1);
  assert.equal(t.imp(size).importedCount,1);
  assert.equal(t.sheets.Inventory.rows[1][9],size);
  assert.equal(t.sheets.Inventory.rows[1][4],unit);
  assert.equal(t.sheets.Inventory.rows[1][5].toISOString().slice(0,10),'2026-09-24');
  assert.equal(t.sheets.Inventory.rows[1][6].toISOString().slice(0,10),'2028-09-24');
  assert.equal(t.ctx.medStockWebApiDashboard_(t.ss).inventory[0].lot,'2026-09-24');
  assert.throws(() => t.imp(size), /not available|already/);
  assert.throws(() => t.cut(.5), /whole bottles/);
  assert.throws(() => t.cut(size+1), /Insufficient/);
  for (let left=size-1;left>=0;left--) {
    t.cut(1);
    assert.equal(t.sheets.Inventory.rows[1][9],left);
    assert.equal(t.sheets.Inventory.rows[1][13],'OPEN');
    assert.equal(t.sheets.Inventory.rows[1][8],left ? 'IN STOCK' : 'OUT OF STOCK');
  }
  assert.throws(() => t.cut(1), /not available/);
  assert.equal(t.sheets['Log Data'].getLastRow(),size+2);
}
{
  const t=setup(); t.imp(5);
  const check=(qty,type)=>t.ctx.medStockCheckStockBatch_({branch:'Thonglor',items:[{id:t.barcode,actualQuantity:qty,actualType:type,note:'Physical count'}]},t.ss);
  assert.throws(()=>check(4,'FULL'),/must be OPEN/);
  assert.throws(()=>check(6,'OPEN'),/Invalid container/);
  assert.throws(()=>check(4.5,'OPEN'),/Invalid container/);
  check(4,'OPEN'); assert.equal(t.sheets.Inventory.rows[1][9],4);
  t.sheets.Inventory.rows[1][4]='CC';
  assert.throws(()=>t.cut(1),/Legacy unit/);
}
{
  const t=setup(); t.imp(5);
  t.sheets['Log Data'].rows[1][18]='CC';
  const audit=[...t.sheets['Log Data'].rows[1]];
  audit[1]='PACK-CORRECTION'; audit[8]=0; audit[12]=5; audit[13]=5; audit[16]='Pack Correction';
  t.sheets['Log Data'].rows.push(audit);
  // Barcode capacity is retained even if future product packaging changes.
  t.sheets.Inventory.rows[1][14]=10;
  const data=t.ctx.medStockWebApiDashboard_(t.ss);
  assert.equal(data.products[0].unitsPerPack,5);
  assert.equal(data.inventory[0].unitsPerPack,10);
  assert.equal(data.inventory[0].packageUnit,'Box');
  assert.equal(data.transactions.length,1);
  assert.equal(data.transactions[0].unit,'CC');
}
console.log('PASS: box import/cut/check, duplicate and invalid input rejection, retained barcode capacity, historical log units and audit-only corrections. No live stock mutated.');

{
  const t=setup(5,'Bottle');
  t.imp(5);
  t.cut(2,'PARTIAL','USE');
  t.cut(3,'PARTIAL','SALE');
  const saleId=t.sheets['Log Data'].rows.at(-1)[1];
  assert.equal(t.sheets.Inventory.rows[1][9],0);
  assert.throws(()=>t.refund(saleId,1,false),/confirmed unopened/);
  assert.throws(()=>t.refund(saleId,4),/exceeds the remaining/);
  t.refund(saleId,1);
  assert.equal(t.sheets.Inventory.rows[1][9],1);
  assert.equal(t.sheets.Inventory.rows[1][8],'IN STOCK');
  assert.equal(t.sheets.Inventory.rows[1][13],'OPEN');
  assert.equal(t.sheets['Log Data'].rows.at(-1)[7],'RETURN');
  const refundTransaction=t.ctx.medStockWebApiDashboard_(t.ss).transactions[0];
  assert.equal(refundTransaction.action,'REFUND');
  assert.equal(refundTransaction.reference,saleId);
  t.refund(saleId,2);
  assert.equal(t.sheets.Inventory.rows[1][9],3);
  assert.throws(()=>t.refund(saleId,1),/fully refunded/);
  console.log('PASS: partial sale refunds restore sellable stock, retain OPEN state, record the sale reference, and reject unsafe or excessive refunds.');
}
{
  const t=setup(5,'Bottle');
  t.imp(5);
  t.cut(5,'ALL','SALE');
  const saleId=t.sheets['Log Data'].rows.at(-1)[1];
  t.refund(saleId,1);
  assert.equal(t.sheets.Inventory.rows[1][9],1);
  assert.equal(t.sheets.Inventory.rows[1][13],'OPEN');
  console.log('PASS: a partial refund from a fully sold bulk pack returns as OPEN stock.');
}

{
 const t=setup(200,'IU');
 t.sheets['Product List'].rows[1][12]='Bottle';
 t.imp(200); t.cut(20);
 assert.equal(t.sheets.Inventory.rows[1][9],180);
 t.cut(2.5);
 assert.equal(t.sheets.Inventory.rows[1][9],177.5);
 assert.equal(t.ctx.medStockWebApiDashboard_(t.ss).inventory[0].unitsPerPack,200);
 console.log('PASS: 200 IU bottle, partial and fractional IU cuts, retained bottle capacity.');
}
