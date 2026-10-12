import {execFileSync} from 'node:child_process';
import {appendFileSync,readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const runtimePaths=new Set(['scripts/openclaw-cron-dispatcher.py','scripts/video_source_registry_ingest.py','scripts/video_enrichment_worker.py','scripts/video_reel_candidate_worker.py','scripts/video_native_studio_worker.py','scripts/video_library_to_reels.py','scripts/openclaw-requirements.txt','scripts/openclaw-requirements.lock','scripts/openclaw.service','supabase/migrations/20260906235959_video_reels_integrity_foundation.sql']);
export function dispatcherWorkflowContract(source) {
 const jobs=source.indexOf('\njobs:\n'),start=source.indexOf('\n  deploy:\n');
 if(jobs<0||start<0)throw new Error('Existing dispatcher workflow is unavailable');
 let header=source.slice(0,jobs).replace(/      component:\n[\s\S]*?(?=      source_registry_max_sources:)/,'').replace(/      - 'scripts\/ci\/openclaw-component-diff\.mjs'\n/g,'');
 let job=source.slice(start).split('\n  native-reels:\n')[0];
 const condition=job.match(/^    if: ([^\n]+)$/m)?.[1];
 const allowed=["github.ref == 'refs/heads/main'","github.ref == 'refs/heads/main' && (github.event_name != 'workflow_dispatch' || inputs.component != 'native-reels')","github.ref == 'refs/heads/main' && (github.event_name != 'workflow_dispatch' || inputs.component != 'native-reels') && needs.select-component.outputs.dispatcher == 'true'"];
 if(!allowed.includes(condition))return `${header}\n${job}`;
 job=job.replace(/^    if: [^\n]+\n/m,'').replace(/^    needs: select-component\n/m,'');
 return `${header}\n${job.trimEnd()}`;
}
export function shouldPublishDispatcher({event,component='dispatcher',paths=[],before='',after=''}) {
 if(event==='workflow_dispatch')return component!=='native-reels';
 if(paths.some(path=>runtimePaths.has(path)))return true;
 if(!paths.includes('.github/workflows/deploy-openclaw.yml'))return false;
 try{return dispatcherWorkflowContract(before)!==dispatcherWorkflowContract(after);}catch{return true;}
}
function main() {
 const event=process.env.GITHUB_EVENT_NAME;const component=process.env.SELECTED_COMPONENT||'dispatcher';let paths=[],before='',after='';
 if(event==='push') {paths=execFileSync('git',['diff','--name-only','HEAD^','HEAD'],{encoding:'utf8'}).trim().split('\n').filter(Boolean);after=readFileSync('.github/workflows/deploy-openclaw.yml','utf8');try{before=execFileSync('git',['show','HEAD^:.github/workflows/deploy-openclaw.yml'],{encoding:'utf8'});}catch{before='';}}
 const dispatcher=shouldPublishDispatcher({event,component,paths,before,after});
 if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,`dispatcher=${dispatcher}\n`);
 console.log(JSON.stringify({component:'openclaw-dispatcher',publicationNeeded:dispatcher}));
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url)main();
