// Each pair exercises the same enabled Next rule with invalid and valid code.
// Upstream outcomes were checked with @next/eslint-plugin-next 16.3.8.
export const nextFixtures = [
  {
    rule: "google-font-display",
    invalid: '<link href="https://fonts.googleapis.com/css2?family=Roboto&display=block" rel="stylesheet" />',
    valid: '<link href="https://fonts.googleapis.com/css2?family=Roboto&display=swap" rel="stylesheet" />',
  },
  {
    rule: "google-font-preconnect",
    invalid: '<link href="https://fonts.gstatic.com" />',
    valid: '<link href="https://fonts.gstatic.com" rel="preconnect" />',
  },
  {
    rule: "next-script-for-ga",
    invalid: '<script src="https://www.google-analytics.com/analytics.js" />',
    valid: 'import Script from "next/script"; export default function Example() { return <Script src="https://www.google-analytics.com/analytics.js" />; }',
  },
  {
    rule: "no-async-client-component",
    invalid: '"use client"; export default async function Example() { return <div />; }',
    valid: '"use client"; export default function Example() { return <div />; }',
  },
  {
    rule: "no-before-interactive-script-outside-document",
    invalid: 'import Script from "next/script"; export default function Example() { return <Script src="/script.js" strategy="beforeInteractive" />; }',
    valid: 'import Script from "next/script"; export default function Example() { return <Script src="/script.js" strategy="afterInteractive" />; }',
  },
  {
    rule: "no-css-tags",
    invalid: '<link href="/style.css" rel="stylesheet" />',
    valid: '<link href="/style.css" rel="preload" as="style" />',
  },
  {
    rule: "no-head-element",
    invalid: '<head><meta name="example" content="value" /></head>',
    valid: 'import Head from "next/head"; export default function Example() { return <Head><meta name="example" content="value" /></Head>; }',
  },
  {
    rule: "no-html-link-for-pages",
    invalid: '<a href="/">Home</a>',
    valid: 'import Link from "next/link"; export default function Example() { return <Link href="/">Home</Link>; }',
  },
  {
    rule: "no-img-element",
    invalid: '<img src="/logo.png" alt="Logo" />',
    valid: 'import Image from "next/image"; export default function Example() { return <Image src="/logo.png" alt="Logo" width={24} height={24} />; }',
  },
  {
    rule: "no-page-custom-font",
    invalid: '<link href="https://fonts.googleapis.com/css2?family=Roboto&display=swap" rel="stylesheet" />',
    valid: '<link href="/local-font.css" rel="stylesheet" />',
  },
  {
    rule: "no-styled-jsx-in-document",
    filename: "pages/_document.tsx",
    invalid: 'export default function Document() { return <style jsx>{`div {color: red}`}</style>; }',
    valid: 'export default function Document() { return <style>{`div {color: red}`}</style>; }',
  },
  {
    rule: "no-sync-scripts",
    invalid: '<script src="/script.js" />',
    valid: '<script src="/script.js" async />',
  },
  {
    rule: "no-title-in-document-head",
    filename: "pages/_document.tsx",
    invalid: 'import {Head} from "next/document"; export default function Document() { return <Head><title>Title</title></Head>; }',
    valid: 'import {Head} from "next/document"; export default function Document() { return <Head><meta name="example" content="value" /></Head>; }',
  },
  {
    rule: "no-typos",
    invalid: 'export const getStaticprops = () => ({props: {}});',
    valid: 'export const getStaticProps = () => ({props: {}});',
  },
  {
    rule: "no-unwanted-polyfillio",
    invalid: '<script src="https://polyfill.io/v3/polyfill.min.js?features=Array.prototype.copyWithin" />',
    valid: '<script src="/script.js" async />',
  },
  {
    rule: "inline-script-id",
    invalid: 'import Script from "next/script"; export default function Example() { return <Script>{`console.log(1)`}</Script>; }',
    valid: 'import Script from "next/script"; export default function Example() { return <Script id="example">{`console.log(1)`}</Script>; }',
  },
  {
    rule: "no-assign-module-variable",
    invalid: 'const module = {}; export {module};',
    valid: 'const moduleValue = {}; export {moduleValue};',
  },
  {
    rule: "no-document-import-in-page",
    invalid: 'import Document from "next/document"; export default Document;',
    valid: 'import Link from "next/link"; export default Link;',
  },
  {
    rule: "no-duplicate-head",
    filename: "pages/_document.tsx",
    invalid: 'import Document, {Head} from "next/document"; export default class Example extends Document { render() { return <html><Head /><Head /></html>; } }',
    valid: 'import Document, {Head} from "next/document"; export default class Example extends Document { render() { return <html><Head /></html>; } }',
  },
  {
    rule: "no-head-import-in-document",
    filename: "pages/_document.tsx",
    invalid: 'import Head from "next/head"; export default function Document() { return <Head />; }',
    valid: 'import {Head} from "next/document"; export default function Document() { return <Head />; }',
  },
  {
    rule: "no-script-component-in-head",
    invalid: 'import Head from "next/head"; import Script from "next/script"; export default function Example() { return <Head><Script src="/script.js" /></Head>; }',
    valid: 'import Head from "next/head"; import Script from "next/script"; export default function Example() { return <><Head /><Script src="/script.js" /></>; }',
  },
];
