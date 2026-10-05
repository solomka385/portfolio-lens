const test=require('node:test');
const assert=require('node:assert/strict');
const {safeNarrative}=require('../src/services');

test('unverified model numbers do not enter the report',()=>{
  const text='- Аэрофлот: 59.5% портфеля\n- Аэрофлот: тема публикаций связана с маршрутами';
  assert.equal(safeNarrative(text),'- Аэрофлот: тема публикаций связана с маршрутами');
});
