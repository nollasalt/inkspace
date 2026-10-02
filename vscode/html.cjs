const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function editorHtml(webview,mediaUri,vscode,boot){
  const nonce=crypto.randomBytes(18).toString('base64');
  const resource=file=>webview.asWebviewUri(vscode.Uri.joinPath(mediaUri,file)).toString();
  let html=fs.readFileSync(path.join(mediaUri.fsPath,'index.html'),'utf8');
  const nativeOrigin=boot.native?new URL(boot.native.endpoint).origin+(boot.native.transport==='raw-input'?' '+boot.native.endpoint.replace('http:','ws:'):''):'';
  html=html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/,`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}' ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} data: blob:; font-src ${webview.cspSource} data:; worker-src ${webview.cspSource} blob:; connect-src ${webview.cspSource} blob: data: ${nativeOrigin}; object-src 'none'; base-uri 'none'">`);
  html=html.replace(/(src|href)="([^":]+)"/g,(_all,attribute,file)=>`${attribute}="${resource(file)}"`);
  html=html.replace(/<script /g,`<script nonce="${nonce}" `);
  if(boot.native?.transport==='raw-input')html=html.replace('<body>',`<body><script nonce="${nonce}" src="${resource('engine-calibration.js')}"></script>`);
  html=html.replace('</body>',`<script nonce="${nonce}" src="${resource('native-render-async.js')}"></script><script nonce="${nonce}" src="${resource('notebook-delta.js')}"></script><script nonce="${nonce}" src="${resource('adapter.js')}"></script></body>`);
  html=html.replace('<body>',`<body class="vscodium-mode"><meta id="inkspace-native-client" content="${boot.client}"><meta id="inkspace-assets" content="${resource('index.html')}"><meta id="inkspace-boot" content="${Buffer.from(JSON.stringify(boot)).toString('base64')}"><link rel="stylesheet" href="${resource('codium.css')}"><script nonce="${nonce}" src="${resource(boot.native?.transport==='raw-input'?'engine-client.js':'native-client.js')}"></script>`);
  return html;
}
module.exports={editorHtml};
