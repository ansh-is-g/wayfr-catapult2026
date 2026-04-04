const params = new URLSearchParams(window.location.search);
const API_BASE = params.get("api") || "http://localhost:8102";
const VISER_URL = params.get("viser") || "http://localhost:8082";

const reconInfo = document.getElementById("reconInfo");
const annotatorInfo = document.getElementById("annotatorInfo");
const bridgeBtn = document.getElementById("bridgeBtn");
const refreshBtn = document.getElementById("refreshBtn");
const statusSection = document.getElementById("statusSection");
const bridgeIdEl = document.getElementById("bridgeId");
const bridgeStatusEl = document.getElementById("bridgeStatus");
const bridgeMessageEl = document.getElementById("bridgeMessage");
const progressContainer = document.getElementById("progressContainer");
const progressFill = document.getElementById("progressFill");
const objectPanel = document.getElementById("objectPanel");
const objectList = document.getElementById("objectList");
const objectCount = document.getElementById("objectCount");
const viewerSection = document.getElementById("viewerSection");
const viewerIframe = document.getElementById("viewerIframe");
const viewerOpenLink = document.getElementById("viewerOpenLink");

let reconJobs = [];
let annotatorJobs = [];
let currentBridgeId = null;
let pollTimer = null;
let selectedTrackId = null;

const MARKER_COLORS = [
  [255, 80, 80], [80, 200, 80], [80, 120, 255], [255, 200, 50],
  [200, 80, 255], [50, 220, 220], [255, 140, 50], [255, 100, 200],
  [120, 255, 120], [255, 80, 180], [80, 255, 200], [200, 200, 80],
];

function formatJob(job, type) {
  const m = job.metadata || {};
  let lines = [];
  lines.push(`<strong>Job:</strong> ${job.job_id}`);
  if (job.updated_at) {
    const d = new Date(job.updated_at);
    lines.push(`<strong>Date:</strong> ${d.toLocaleString()}`);
  }
  if (type === "recon") {
    if (m.num_frames) lines.push(`<strong>Frames:</strong> ${m.num_frames}`);
    if (m.num_points) lines.push(`<strong>Points:</strong> ${Number(m.num_points).toLocaleString()}`);
    if (m.glb_size_mb) lines.push(`<strong>GLB:</strong> ${m.glb_size_mb} MB`);
    const hasNpz = !!m.scene_data_rel;
    lines.push(`<strong>Scene data:</strong> ${hasNpz ? "available" : "missing"}`);
  } else {
    if (m.objects_detected) {
      const objs = Array.isArray(m.objects_detected) ? m.objects_detected : [];
      lines.push(`<strong>Objects:</strong> ${objs.join(", ") || "none"}`);
    }
    if (m.num_frames) lines.push(`<strong>Frames:</strong> ${m.num_frames}`);
  }
  return `<div class="job-info">${lines.join("<br>")}</div>`;
}

async function discover() {
  reconInfo.innerHTML = '<span class="no-jobs">Scanning...</span>';
  annotatorInfo.innerHTML = '<span class="no-jobs">Scanning...</span>';
  bridgeBtn.disabled = true;

  try {
    const res = await fetch(`${API_BASE}/api/discover`);
    if (!res.ok) throw new Error("Discovery failed");
    const data = await res.json();
    reconJobs = data.recon_jobs || [];
    annotatorJobs = data.annotator_jobs || [];
  } catch (err) {
    reconInfo.innerHTML = `<span class="no-jobs">Error: ${err.message}</span>`;
    annotatorInfo.innerHTML = `<span class="no-jobs">Error: ${err.message}</span>`;
    return;
  }

  if (reconJobs.length > 0) {
    reconInfo.innerHTML = formatJob(reconJobs[0], "recon");
  } else {
    reconInfo.innerHTML = '<span class="no-jobs">No completed reconstruction jobs found.</span>';
  }

  if (annotatorJobs.length > 0) {
    annotatorInfo.innerHTML = formatJob(annotatorJobs[0], "annotator");
  } else {
    annotatorInfo.innerHTML = '<span class="no-jobs">No completed annotation jobs found.</span>';
  }

  bridgeBtn.disabled = !(reconJobs.length > 0 && annotatorJobs.length > 0);
}

async function startBridge() {
  if (!reconJobs.length || !annotatorJobs.length) return;

  bridgeBtn.disabled = true;
  statusSection.style.display = "grid";
  progressContainer.style.display = "block";
  progressFill.style.width = "0%";
  bridgeMessageEl.textContent = "Starting...";
  objectPanel.style.display = "none";
  viewerSection.style.display = "none";
  viewerIframe.src = "about:blank";

  const payload = {
    recon_job_id: reconJobs[0].job_id,
    annotator_job_id: annotatorJobs[0].job_id,
  };

  try {
    const res = await fetch(`${API_BASE}/api/bridge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || "Bridge failed to start");
    }
    const data = await res.json();
    currentBridgeId = data.bridge_id;
    updateStatus(data);
    beginPolling();
  } catch (err) {
    bridgeMessageEl.textContent = `Error: ${err.message}`;
    bridgeBtn.disabled = false;
  }
}

function updateStatus(data) {
  bridgeIdEl.textContent = data.bridge_id || "-";
  bridgeStatusEl.textContent = data.status || "-";
  bridgeMessageEl.textContent = data.message || "";
  progressFill.style.width = `${data.progress || 0}%`;

  if (data.status === "completed") {
    progressContainer.style.display = "none";
    renderObjects(data.objects || []);
    viewerSection.style.display = "flex";
    viewerOpenLink.href = VISER_URL;
    if (viewerIframe.src === "about:blank" || !viewerIframe.src) {
      viewerIframe.src = VISER_URL;
    }
    bridgeBtn.disabled = false;
  }

  if (data.status === "failed") {
    progressContainer.style.display = "none";
    bridgeMessageEl.textContent = `Failed: ${data.error || data.message}`;
    bridgeBtn.disabled = false;
  }
}

function beginPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    if (!currentBridgeId) return;
    try {
      const res = await fetch(`${API_BASE}/api/bridge/${currentBridgeId}`);
      if (!res.ok) return;
      const data = await res.json();
      updateStatus(data);
      if (data.status === "completed" || data.status === "failed") {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    } catch (_) { /* ignore transient errors */ }
  }, 1000);
}

function renderObjects(objects) {
  objectList.innerHTML = "";
  objectCount.textContent = `(${objects.length})`;

  if (objects.length === 0) {
    objectList.innerHTML = '<div style="padding:16px;color:#666;font-size:13px;">No objects found.</div>';
    objectPanel.style.display = "flex";
    return;
  }

  objects.forEach((obj, i) => {
    const item = document.createElement("div");
    item.className = "object-item";
    item.dataset.trackId = obj.track_id;

    const [cr, cg, cb] = MARKER_COLORS[i % MARKER_COLORS.length];
    const c3d = obj.centroid_3d;
    const pos = c3d ? `(${c3d[0].toFixed(2)}, ${c3d[1].toFixed(2)}, ${c3d[2].toFixed(2)})` : "";

    item.innerHTML = `
      <div class="obj-label">
        <span class="color-dot" style="background:rgb(${cr},${cg},${cb})"></span>
        ${obj.label}
      </div>
      <div class="obj-meta">
        ${obj.n_points.toLocaleString()} pts &middot; ${obj.n_observations} views &middot; conf ${(obj.confidence * 100).toFixed(0)}%
      </div>
      <div class="obj-pos">${pos}</div>
    `;

    item.addEventListener("click", () => selectObject(obj.track_id, item));
    objectList.appendChild(item);
  });

  objectPanel.style.display = "flex";
}

async function selectObject(trackId, element) {
  const wasSelected = selectedTrackId === trackId;

  document.querySelectorAll(".object-item.selected").forEach((el) => {
    el.classList.remove("selected");
  });

  if (wasSelected) {
    selectedTrackId = null;
    await fetch(`${API_BASE}/api/bridge/${currentBridgeId}/deselect`, { method: "POST" });
    return;
  }

  selectedTrackId = trackId;
  element.classList.add("selected");

  try {
    await fetch(`${API_BASE}/api/bridge/${currentBridgeId}/select/${trackId}`, {
      method: "POST",
    });
  } catch (_) { /* ignore */ }
}

bridgeBtn.addEventListener("click", startBridge);
refreshBtn.addEventListener("click", discover);

discover();
