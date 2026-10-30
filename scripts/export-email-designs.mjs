// Static sample files only. This script never contacts an email provider or writes to Firebase.
import { mkdir, writeFile, copyFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import {
  emailTemplates,
  emailSampleData,
  renderEmail,
  firebaseEmailDocument,
} from "../packages/integrations/dist/email/index.js";
const output = resolve(process.argv[2] || "artifacts/email-designs");
const previewOrigin = "https://preview.tlc.example";
await mkdir(output, { recursive: true });
const images = new Set(["logo.png"]);
const manifest = [];
for (const template of emailTemplates) {
  const data = emailSampleData(template.id, previewOrigin);
  const rendered = renderEmail(template.id, data, {
    siteUrl: previewOrigin,
    year: 2026,
  });
  const html = rendered.html.replaceAll(
    `${previewOrigin}/images/`,
    "./images/",
  );
  for (const match of html.matchAll(/src="\.\/images\/([^"]+)"/g))
    images.add(match[1]);
  await Promise.all([
    writeFile(`${output}/${template.id}.html`, html),
    writeFile(`${output}/${template.id}.txt`, rendered.text),
    writeFile(
      `${output}/${template.id}.json`,
      JSON.stringify(
        {
          previewOnly: true,
          templateId: template.id,
          designVersion: rendered.version,
          variables: data,
          firebase: firebaseEmailDocument(
            "sample-traveller@example.test",
            rendered,
          ),
        },
        null,
        2,
      ) + "\n",
    ),
  ]);
  manifest.push({
    ...template,
    files: {
      html: `${template.id}.html`,
      text: `${template.id}.txt`,
      payload: `${template.id}.json`,
    },
  });
}
for (const file of images) {
  const target = `${output}/images/${file}`;
  await mkdir(dirname(target), { recursive: true });
  await copyFile(resolve("apps/web/public/images", file), target);
}
await writeFile(
  `${output}/manifest.json`,
  JSON.stringify(manifest, null, 2) + "\n",
);
const index = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TLC · The correspondence collection</title><style>*{box-sizing:border-box}body{margin:0;background:#f7f4f1;color:#2a1820;font-family:Arial,Helvetica,sans-serif}header{padding:32px 40px;border-top:4px solid #b01824;background:white;border-bottom:1px solid #e5dcda;display:flex;gap:30px;align-items:center;justify-content:space-between}header img{width:140px;height:auto}header h1{font:32px Georgia,serif;margin:8px 0}header p{color:#78686c;font-size:13px;line-height:1.6}header small{color:#a31319;letter-spacing:2px;font-size:10px}.badge{padding:12px 16px;border:1px solid #e5dcda;border-radius:28px;font-size:12px;white-space:nowrap}main{display:grid;grid-template-columns:280px minmax(0,1fr);gap:24px;padding:24px 40px;max-width:1480px;margin:auto}aside{background:white;border:1px solid #e5dcda;border-radius:12px;padding:12px;height:calc(100vh - 240px);min-height:400px;overflow:auto;position:sticky;top:20px}input,select{width:100%;padding:12px;border:1px solid #e5dcda;border-radius:6px;margin-bottom:10px;font-size:13px}nav button{width:100%;background:transparent;border:0;text-align:left;border-radius:7px;padding:13px;cursor:pointer;color:#3e2930}nav button.active{background:#f8e9e9;color:#a31319}nav small{display:block;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:#8b7179;margin-bottom:6px}nav strong{font-size:12px}section{min-width:0;background:white;border:1px solid #e5dcda;border-radius:12px;overflow:hidden}.toolbar{padding:14px 20px;display:flex;align-items:center;flex-wrap:wrap;gap:8px;border-bottom:1px solid #e5dcda}.toolbar button,.toolbar a{background:#f4eeeb;color:#4a1619;border:0;padding:11px 14px;border-radius:6px;cursor:pointer;font-size:12px;text-decoration:none}.toolbar button.active{background:#4a1619;color:white}.toolbar .downloads{margin-left:auto;display:flex;gap:8px}.envelope{padding:24px}.envelope small{font-size:10px;color:#947c83;letter-spacing:1px}.envelope h2{font-size:17px;line-height:1.5;margin-bottom:0}.canvas{padding:22px;background:#e8e2de;text-align:center}.canvas iframe{display:block;width:100%;height:1100px;max-width:800px;border:0;margin:auto;background:#f5efeb}.canvas.mobile iframe{max-width:375px}.note{padding:22px;font-size:12px;line-height:1.8;color:#75646a}.note b{color:#4a1619}@media(max-width:760px){header{padding:24px;align-items:flex-start}header h1{font-size:27px}header img{display:none}main{padding:16px;grid-template-columns:1fr}aside{position:static;height:280px;min-height:0}.canvas{padding:0}.badge{display:none}.toolbar .downloads{margin-left:0}}</style></head><body><header><div><small>THE TLC CORRESPONDENCE COLLECTION</small><h1>Every message. A little more TLC.</h1><p>Beautifully considered emails for every step of the journey.<br>Fictional preview content · No credentials required · Nothing is sent</p></div><img src="images/logo.png" alt="TLC Holidays"><span class="badge">${emailTemplates.length} ready-to-render designs</span></header><main><aside><input id="search" aria-label="Find a design" placeholder="Find an email design"><select id="category" aria-label="Category"><option>All designs</option>${[...new Set(emailTemplates.map((t) => t.category))].map((c) => `<option>${c}</option>`).join("")}</select><nav id="list" aria-label="Email designs"></nav></aside><section><div class="toolbar"><button id="desktop" class="active">Desktop</button><button id="mobile">Mobile</button><div class="downloads"><a id="html" download>Download HTML</a><a id="text" download>Plain text</a><a id="payload" download>Sample payload</a></div></div><div class="envelope"><small id="group"></small><h2 id="title"></h2></div><div id="canvas" class="canvas"><iframe id="preview" title="Email design preview" sandbox=""></iframe></div><div class="note"><b>When this email is used</b><p id="trigger"></p><p id="integration"></p><p>Images are bundled for offline review. Sample action links use a reserved preview domain. Use the shared renderer with real data and your public site URL for delivery.</p></div></section></main><script>const templates=${JSON.stringify(manifest).replaceAll("<", "\\u003c")};let active='quote-ready';const $=id=>document.getElementById(id);function show(id){const t=templates.find(x=>x.id===id);active=id;$('preview').src=t.files.html;$('preview').title=t.name+' email preview';$('title').textContent=t.name;$('group').textContent=t.category.toUpperCase()+' / '+t.layout.toUpperCase();$('trigger').textContent=t.trigger;$('integration').textContent=t.integration==='connected'?'Design connected to an existing sending path. Provider setup and campaign approval still apply.':t.integration==='auth-provider'?'Ready for secure authentication-provider action links; connect during integration.':'Template and payload ready. Connect the event adapter during email integration.';for(const kind of ['html','text','payload'])$(kind).href=t.files[kind];list()}function list(){$('list').replaceChildren();for(const t of templates.filter(x=>($('category').value==='All designs'||x.category===$('category').value)&&(x.name+' '+x.trigger).toLowerCase().includes($('search').value.toLowerCase()))){const b=document.createElement('button');b.className=t.id===active?'active':'';b.setAttribute('aria-pressed',String(t.id===active));const s=document.createElement('small');s.textContent=t.category;const label=document.createElement('strong');label.textContent=t.name;b.append(s,label);b.onclick=()=>show(t.id);$('list').append(b)}}$('search').oninput=list;$('category').onchange=list;for(const mode of ['desktop','mobile'])$(mode).onclick=()=>{$('canvas').className='canvas '+mode;$('desktop').className=mode==='desktop'?'active':'';$('mobile').className=mode==='mobile'?'active':''};show(active);</script></body></html>`;
await writeFile(`${output}/index.html`, index);
console.log(
  `Exported ${manifest.length} email designs, plain-text versions and sample Firebase payloads to ${output}`,
);
