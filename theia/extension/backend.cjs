const path=require('node:path'),express=require('express');
const {ContainerModule}=require('@theia/core/shared/inversify');
const {BackendApplicationContribution}=require('@theia/core/lib/node/backend-application');
module.exports.default=new ContainerModule(bind=>bind(BackendApplicationContribution).toConstantValue({configure(application){application.use('/inkspace',express.static(path.join(process.cwd(),'media'),{setHeaders(response){response.setHeader('Content-Security-Policy',"default-src 'self' data: blob:; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'")}}))}}));
