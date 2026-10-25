import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const source=fs.readFileSync(new URL('../components/editorial-browser.tsx',import.meta.url),'utf8');
const helpers=source.slice(source.indexOf('function text('),source.indexOf('let twitterScriptPromise'));
const players=source.slice(source.indexOf('function OfficialInstagram('),source.indexOf('function ageChildren(')).replace('function OfficialInstagram(', 'export function OfficialInstagram(').replace('function ShortPlayer(', 'export function ShortPlayer(');
const code=ts.transpileModule(`import React,{useState,useEffect} from ${JSON.stringify(import.meta.resolve('react'))};import icons from ${JSON.stringify(import.meta.resolve('lucide-react'))};const {Instagram:InstagramIcon,Play}=icons;type Item=Record<string,any>;${helpers}\n${players}`,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
const {ShortPlayer,editorialVideoEmbed}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const items=JSON.parse(fs.readFileSync(new URL('../data/editorial.json',import.meta.url),'utf8')).shorts;
test('every registered short renders its official iframe before any tap',()=>{
 assert.ok(items.length>=197);
 for(const item of items){const embed=editorialVideoEmbed(item);assert.ok(embed,item.url);const html=renderToStaticMarkup(React.createElement(ShortPlayer,{item}));assert.ok(html.includes('<iframe'),item.url);assert.ok(!html.includes('<button'),item.url);assert.ok(!html.includes('タップ'),item.url);assert.match(embed.src,/^https:\/\/(?:www\.youtube-nocookie\.com\/embed\/|www\.instagram\.com\/(?:p|reel)\/|www\.tiktok\.com\/player\/v1\/)/);}
});
