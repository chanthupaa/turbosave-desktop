import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';
if(!process.env.CSC_LINK&&!process.env.WIN_CSC_LINK)throw Error('A code-signing certificate is required. Configure CSC_LINK and enter its password privately before a signed release build.');
const cli=fileURLToPath(new URL('../node_modules/electron-builder/cli.js',import.meta.url));
const child=spawn(process.execPath,[cli,'--win','portable','nsis','--x64','-c.win.signAndEditExecutable=true','-c.win.signExecutable=true','-c.forceCodeSigning=true'],{cwd:fileURLToPath(new URL('..',import.meta.url)),stdio:'inherit',env:{...process.env,ELECTRON_BUILDER_COMPRESSION_LEVEL:'3'}});
child.on('error',error=>{console.error(error.message);process.exitCode=1;});child.on('exit',code=>{process.exitCode=code??1;});
