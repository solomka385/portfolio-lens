const fs = require('node:fs');
const path = require('node:path');
const initSqlJs = require('sql.js');

class Store {
  async init(dir) {
    this.file = path.join(dir, 'portfolio.sqlite');
    fs.mkdirSync(dir, {recursive:true});
    const SQL = await initSqlJs({locateFile: file => require.resolve(`sql.js/dist/${file}`)});
    this.db = fs.existsSync(this.file) ? new SQL.Database(fs.readFileSync(this.file)) : new SQL.Database();
    this.db.run('CREATE TABLE IF NOT EXISTS portfolio (id TEXT PRIMARY KEY, name TEXT NOT NULL, base TEXT NOT NULL, created TEXT NOT NULL)');
    this.db.run('CREATE TABLE IF NOT EXISTS position (id TEXT PRIMARY KEY, portfolio_id TEXT NOT NULL, payload TEXT NOT NULL)');
    this.db.run('CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY, payload TEXT NOT NULL, updated TEXT NOT NULL)');
    if (!this.db.exec('SELECT id FROM portfolio LIMIT 1').length) this.db.run('INSERT INTO portfolio VALUES (?, ?, ?, ?)', ['default','Мой портфель','RUB',new Date().toISOString()]);
    this.save();
  }
  save() {
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, Buffer.from(this.db.export()));
    fs.renameSync(tmp, this.file);
  }
  all() {
    const portfolios = this.db.exec('SELECT id,name,base,created FROM portfolio ORDER BY created');
    const positions = this.db.exec('SELECT id,portfolio_id,payload FROM position');
    return { portfolios: portfolios[0]?.values.map(v => Object.fromEntries(portfolios[0].columns.map((k,i) => [k,v[i]]))) || [], positions: positions[0]?.values.map(v => ({...JSON.parse(v[2]), portfolioId:v[1]})) || [] };
  }
  upsertPortfolio(p) { this.db.run('INSERT OR REPLACE INTO portfolio VALUES (?,?,?,?)',[p.id,p.name,p.base,p.created || new Date().toISOString()]); this.save(); }
  putPositions(portfolioId, positions) {
    this.db.run('BEGIN');
    try { this.db.run('DELETE FROM position WHERE portfolio_id=?',[portfolioId]); for (const p of positions) this.db.run('INSERT INTO position VALUES (?,?,?)',[p.id,portfolioId,JSON.stringify(p)]); this.db.run('COMMIT'); this.save(); }
    catch(e) { this.db.run('ROLLBACK'); throw e; }
  }
  getCache(key) {
    const result = this.db.exec('SELECT payload,updated FROM cache WHERE key=?',[key]);
    if (!result.length) return null;
    return { value:JSON.parse(result[0].values[0][0]), updated:result[0].values[0][1] };
  }
  setCache(key,value) { this.db.run('INSERT OR REPLACE INTO cache VALUES (?,?,?)',[key,JSON.stringify(value),new Date().toISOString()]); this.save(); }
}
module.exports = Store;
