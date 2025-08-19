/* tslint:disable */
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import {GenerateVideosParameters, GoogleGenAI} from '@google/genai';

const GEMINI_API_KEY = process.env.API_KEY;

// State
let base64data = '';
const sceneData: {
  prompt: string;
  videoUrl?: string;
}[] = [];

// DOM Elements
const narrativeInput = document.querySelector('#narrative-input') as HTMLTextAreaElement;
const fileInput = document.querySelector('#file-input') as HTMLInputElement;
const createStoryboardButton = document.querySelector('#create-storyboard-button') as HTMLButtonElement;
const storyboardContainer = document.querySelector('#storyboard-container') as HTMLDivElement;
const statusEl = document.querySelector('#status') as HTMLParagraphElement;
const quotaErrorEl = document.querySelector('#quota-error') as HTMLDivElement;
const openKeyEl = document.querySelector('#open-key') as HTMLButtonElement;


// Utility Functions
async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result as string;
      resolve(url.split(',')[1]);
    };
    reader.readAsDataURL(blob);
  });
}

function downloadFile(url: string, filename: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// Gemini API Call
async function generateContent(prompt: string, imageBytes: string | null): Promise<string> {
  const ai = new GoogleGenAI({apiKey: GEMINI_API_KEY});

  const config: GenerateVideosParameters = {
    model: 'veo-2.0-generate-001',
    prompt: `cinematic, high quality, infinite zoom style video: ${prompt}`,
    config: {
      numberOfVideos: 1,
    },
  };

  if (imageBytes) {
    config.image = {
      imageBytes,
      mimeType: 'image/png', // Assuming PNG from file input
    };
  }

  let operation = await ai.models.generateVideos(config);

  while (!operation.done) {
    console.log('Waiting for completion');
    await delay(1000);
    operation = await ai.operations.getVideosOperation({operation});
  }

  const videos = operation.response?.generatedVideos;
  if (videos === undefined || videos.length === 0) {
    throw new Error('No videos generated');
  }

  const video = videos[0];
  const url = decodeURIComponent(video.video.uri);
  const res = await fetch(`${url}&key=${GEMINI_API_KEY}`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}


// UI Logic
function createSceneCard(sceneText: string, index: number) {
  const sceneId = `scene-${index}`;
  const card = document.createElement('div');
  card.className = 'scene-card';
  card.id = sceneId;

  card.innerHTML = `
    <h3>Scene ${index + 1}</h3>
    <p class="prompt-text">${sceneText}</p>
    <div class="video-container">
      <video controls loop style="display: none;"></video>
    </div>
    <p class="scene-status">Ready to generate.</p>
    <div class="scene-actions">
      <button class="generate-scene-button">Generate</button>
      <button class="download-scene-button" style="display: none;">Download</button>
    </div>
  `;

  const generateButton = card.querySelector('.generate-scene-button') as HTMLButtonElement;
  const downloadButton = card.querySelector('.download-scene-button') as HTMLButtonElement;
  const videoEl = card.querySelector('video') as HTMLVideoElement;
  const sceneStatusEl = card.querySelector('.scene-status') as HTMLParagraphElement;

  generateButton.addEventListener('click', async () => {
    generateButton.disabled = true;
    downloadButton.style.display = 'none';
    sceneStatusEl.innerText = 'Generating... This may take a few minutes.';
    quotaErrorEl.style.display = 'none';

    try {
      const imageForPrompt = index === 0 ? base64data : null;
      const videoUrl = await generateContent(sceneText, imageForPrompt);
      sceneData[index].videoUrl = videoUrl;

      videoEl.src = videoUrl;
      videoEl.style.display = 'block';
      downloadButton.style.display = 'inline-block';
      sceneStatusEl.innerText = 'Done.';
    } catch (e) {
      sceneStatusEl.innerText = `Error: ${e.message}`;
      console.error(e);
      try {
        const err = JSON.parse(e.message);
        if (err.error.code === 429) {
          quotaErrorEl.style.display = 'block';
          sceneStatusEl.innerText = 'Quota limit reached.';
        } else {
          sceneStatusEl.innerText = `Error: ${err.error.message}`;
        }
      } catch (err) {
        // Fallback for non-JSON errors
      }
    } finally {
      generateButton.disabled = false;
    }
  });

  downloadButton.addEventListener('click', () => {
    if (sceneData[index].videoUrl) {
      downloadFile(sceneData[index].videoUrl, `scene_${index + 1}.mp4`);
    }
  });

  return card;
}

createStoryboardButton.addEventListener('click', () => {
  const narrative = narrativeInput.value.trim();
  if (!narrative) {
    statusEl.innerText = 'Please enter a narrative first.';
    return;
  }

  const scenes = narrative.split('\n\n').filter(s => s.trim() !== '');
  storyboardContainer.innerHTML = '';
  sceneData.length = 0;

  if (scenes.length === 0) {
    statusEl.innerText = 'No scenes found in the narrative. Please separate scenes with a blank line.';
    return;
  }

  scenes.forEach((sceneText, index) => {
    sceneData.push({ prompt: sceneText });
    const card = createSceneCard(sceneText, index);
    storyboardContainer.appendChild(card);
  });

  statusEl.innerText = `Storyboard created with ${scenes.length} scenes.`;
});


fileInput.addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files[0];
  if (file) {
    base64data = await blobToBase64(file);
    statusEl.innerText = 'Conditioning image loaded for Scene 1.';
  } else {
    base64data = '';
    statusEl.innerText = 'Conditioning image removed.';
  }
});


openKeyEl.addEventListener('click', async () => {
  await window.aistudio?.openSelectKey();
});

statusEl.innerText = 'Ready.';
