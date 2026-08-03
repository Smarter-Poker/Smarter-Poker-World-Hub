const p=require('@babel/parser'); const fs=require('fs');
let bad=0;
for (const f of process.argv.slice(2)) {
  try { p.parse(fs.readFileSync(f,'utf8'), {sourceType:'module', plugins:['jsx','typescript']}); console.log('OK   '+f); }
  catch(e){ bad++; console.log('FAIL '+f+' :: '+e.message.split('\n')[0]); }
}
console.log('PARSE_FAILURES='+bad);
