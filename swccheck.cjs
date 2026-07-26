const path=require('path'), fs=require('fs');
const swc=require('next/dist/build/swc');
const files=fs.readFileSync('/tmp/changed.txt','utf8').trim().split('\n').filter(f=>/\.(js|jsx|tsx)$/.test(f));
(async()=>{
  let fail=0;
  for(const f of files){
    const code=fs.readFileSync(f,'utf8');
    try{
      await swc.transform(code,{filename:f,jsc:{parser:{syntax:f.endsWith('.tsx')?'typescript':'ecmascript',jsx:true,tsx:f.endsWith('.tsx')},target:'es2020'}});
      console.log('OK   '+f);
    }catch(e){fail++;console.log('FAIL '+f+'\n     '+String(e.message).split('\n').slice(0,5).join('\n     '));}
  }
  console.log('\nSWC_FAILURES='+fail+' of '+files.length);
  process.exit(fail?1:0);
})();
