import { Handler, HandlerEvent } from '@netlify/functions'
import fetch from 'node-fetch';

let examplesCache = new Map();
async function getExamples(ref = "latest") {
  if (examplesCache.has(ref)) {
    return examplesCache.get(ref);
  }

  const headers = {
    Accept: "application/vnd.github.v3+json",
  }
  if (typeof process.env.VITE_GITHUB_TOKEN === 'undefined') {
    console.warn(`VITE_GITHUB_TOKEN is undefined. You may run into rate-limiting issues.`);
  } else {
    headers['Authorization'] = `token ${process.env.VITE_GITHUB_TOKEN}`;
  }
  const examples = await fetch(
    `https://api.github.com/repos/withastro/astro/contents/examples?ref=${ref}`,
    {
      headers
    }
  ).then((res) => res.json());

  if (!Array.isArray(examples)) {
    console.log(examples);
    throw new Error(`Unable to fetch templates from GitHub`);
  }

  const values = examples.map(example => (example.size > 0 ? null : ({
    name: example.name,
    github: example.html_url,
    netlify: 'https://astro.build',
    stackblitz: `https://stackblitz.com/github/withastro/astro/tree/${ref}/examples/${example.name}`,
    codesandbox: `https://githubbox.com/withastro/astro/tree/${ref}/examples/${example.name}`,
  }))).filter(x => x);

  examplesCache.set(ref, values);

  return values
}

const releaseCache = new Map();
async function getRelease(ref: string) {
  if (releaseCache.has(ref)) {
    return releaseCache.get(ref);
  }

  const headers = {
    Accept: "application/vnd.github.v3+json",
  }
  if (typeof process.env.VITE_GITHUB_TOKEN === 'undefined') {
    console.warn(`VITE_GITHUB_TOKEN is undefined. You may run into rate-limiting issues.`);
  } else {
    headers['Authorization'] = `token ${process.env.VITE_GITHUB_TOKEN}`;
  }

  const release = await fetch(
    `https://api.github.com/repos/withastro/astro/releases/tags/astro@${ref}`,
    {
      headers
    }
  ).then(res => res.status === 200 ? res.json() : null);

  releaseCache.set(ref, release);

  return release
}

async function validateRef(name: string) {
  if (name === 'next' || name === 'latest') {
    return true;
  }
  
  const release = await getRelease(name);
  if (release !== null) {
    return true;
  }

  throw new Error(`Invalid version "${name}"! Supported versions are "next", "latest", or any <a href="https://github.com/withastro/astro/releases?q=astro%40">GitHub release</a>.`);
}

const PLATFORMS = new Set(['stackblitz', 'codesandbox', 'netlify', 'github']);
function isPlatform(name: string) {
  return PLATFORMS.has(name);
}

async function parseReq(event: HandlerEvent) {
  let { path, queryStringParameters: { on: platform = 'stackblitz' } } = event;
  path = path.slice(1);

  if (!isPlatform(platform)) {
    throw new Error(`Unsupported "on" query! Supported platforms are:\n  - ${Array.from(PLATFORMS.values()).map(x => x).join(`\n  - `)}`)
  }

  let value = {
    ref: 'latest',
    template: path,
    platform
  }

  if (path.indexOf('@') > -1) {
    const [template, ref] = path.split('@')
    await validateRef(ref);
    value.template = template;
    if (ref === 'next') {
      value.ref = 'main';
    } else if (ref === 'latest') {
      value.ref = 'latest';
    } else {
      value.ref = `astro@${ref}`;
    }
  }
  
  return value;
}


const handler: Handler = async (event, context) => {
  try {
    const { ref, template, platform } = await parseReq(event);
    
    const examples = await getExamples(ref);
    const example = examples.find(x => x.name === template);

    if (!example) {
      return {
        statusCode: 404,
        body: `Unable to find ${template}! Supported templates are:\n  - ${examples.map(x => x.name).join(`\n  - `)}`
      }
    }

    return {
      statusCode: 302,
      headers: {
        Location: example[platform]
      }
    }
  } catch (e) {
    return {
      statusCode: 400,
      headers: {
        "content-type": "text/html; charset=utf-8"
      },
      body: `${e.message}`
    }
  }
}

export { handler }
