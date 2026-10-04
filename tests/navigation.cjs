const assert=require('node:assert/strict'),{search,movePage,nextTitle}=require('../vscode/navigation-data.js');
const note=(id,markdown)=>({id,markdown}),page=(id,title,notes)=>({id,title,document:{notes}});
const book={activePage:'a',pages:[page('a','Alpha',[note('one','A.*B a.*b 中文 中文'),{id:'img',kind:'image',markdown:'中文'}]),page('b','中文标题',[note('two','Alpha beta')])]};
const original=JSON.stringify(book);assert.equal(search(book,'a.*b').items.length,2);assert.equal(search(book,'中文').items.length,3);assert.equal(search(book,'ALPHA').items.length,2);assert.equal(search(book,'').items.length,0);assert.equal(search(book,'[').items.length,0);assert.equal(JSON.stringify(book),original);
const many={pages:[page('p','Page',[note('n','x '.repeat(5000))])]};const limited=search(many,'x');assert.equal(limited.items.length,300);assert(limited.limited);assert.equal(limited.items[299].start,598);assert.equal(limited.items[0].end,1);
assert(!movePage(book,'a',-1));assert(!movePage(book,'b',1));assert(!movePage(book,'missing',1));assert(!movePage(book,'a',3));assert(movePage(book,'a',1));assert.deepEqual(book.pages.map(page=>page.id),['b','a']);assert.equal(book.activePage,'a');assert(movePage(book,'a',-1));assert.equal(JSON.stringify(book),original);
assert.equal(nextTitle({pages:[page('a','第 3 页',[]),page('b','第 4 页',[])]}),'第 5 页');
console.log(JSON.stringify({passed:true,literalSearch:true,chineseAndCaseInsensitive:true,pageTitles:true,imagesExcluded:true,boundedResults:true,searchDoesNotMutate:true,pageOrderBoundaries:true,activePagePreserved:true,uniqueNewPageName:true}));
