const crypto = require('crypto');
const secret = process.env.DEPLOY_WEBHOOK_SECRET || 'test';

const bodyObj = {
  type: "deployment.error",
  payload: {
    deployment: {
      id: "dpl_ExPiMUMWArFiD5Xa1Pij2NpHj97M",
      projectId: "prj_op66GkZyZcygXQKm76iyycfVFAQx",
      state: "ERROR",
      meta: {
        githubCommitSha: "926c6f9c6c21",
        githubCommitMessage: "Testing webhook pipeline manually via script"
      }
    }
  }
};

const rawBody = JSON.stringify(bodyObj);
const signature = crypto.createHmac('sha1', secret).update(rawBody).digest('hex');

fetch('https://smarter.poker/api/deploy-monitor', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-vercel-signature': signature
  },
  body: rawBody
})
.then(async res => {
  console.log('STATUS:', res.status);
  console.log('BODY:', await res.text());
})
.catch(console.error);
