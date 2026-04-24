
    // ──────────────────────────────────────
    // State
    // ──────────────────────────────────────
    const spaceId    = "<%= spaceId %>";
    const roundName  = "<%= roundName %>";

    let currentQ       = "";
    let currentQIndex  = 0;
    let totalQs        = 10;
    let conversationHistory = [];
    let answers        = {};
    let mediaStream    = null;
    let recognition    = null;
    let isRecording    = false;
    let finalTranscript = "";
    let currentMode    = "audio"; // "audio" | "text"
    let isSubmitting   = false;   // guard against double-submit

    // Countdown state
    let countdownInterval = null;
    let countdownSecs     = 120; // 2 minutes
    const MAX_SECS        = 120;

    // ──────────────────────────────────────
    // Init
    // ──────────────────────────────────────
    document.addEventListener("DOMContentLoaded", () => {
      initCamera();
      initInterview();
      setupTextMode();
    });

    async function initInterview() {
      try {
        const res  = await fetch(`/generate-questions/${spaceId}/${roundName}`);
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        currentQ      = data.question;
        currentQIndex = data.questionNumber || 1;
        totalQs       = data.totalQuestions  || 10;

        const overlay = document.getElementById("loadingOverlay");
        overlay.style.opacity = "0";
        setTimeout(() => overlay.style.display = "none", 500);

        updateProgress(currentQIndex, totalQs);
        showQuestion(currentQ);

      } catch (err) {
        lastInitError = err.message || "Failed to connect to AI server";
        showToast("Failed to connect to AI server. Please refresh.", "danger");
      }
    }

    async function initCamera() {
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: true });
        document.getElementById("webcam").srcObject = mediaStream;
      } catch (e) {
        document.getElementById("noCam").style.display = "flex";
      }
    }

    // ──────────────────────────────────────
    // Question display + TTS
    // ──────────────────────────────────────
    function showQuestion(text) {
      document.getElementById("questionText").textContent = `"${text}"`;
      resetAnswerUI();
      setAiState("Speaking");

      if ("speechSynthesis" in window) {
        speechSynthesis.cancel();
        const utt = new SpeechSynthesisUtterance(text);
        const voices = speechSynthesis.getVoices();
        const pref = voices.find(v =>
          v.name.includes("Google US English") || v.name.includes("Samantha") || v.name.includes("Daniel")
        );
        if (pref) utt.voice = pref;
        utt.rate  = 1.05;
        utt.onend = () => {
          setAiState("Listening");
          if (currentMode === "audio") setTimeout(startRecording, 500);
        };
        speechSynthesis.speak(utt);
      } else {
        setAiState("Listening");
        if (currentMode === "audio") startRecording();
      }
    }

    function setAiState(label) {
      const el = document.getElementById("aiState");
      const ring = document.getElementById("aiRing");
      const wrap = document.getElementById("videoWrapper");
      
      el.textContent = label;
      if (label === "Speaking") {
        el.style.color = "#5AC8FA";
        ring.style.display = "block";
        wrap.classList.add("ai-speaking");
      } else if (label === "Listening") {
        el.style.color = "#34C759";
        ring.style.display = "none";
        wrap.classList.remove("ai-speaking");
      } else {
        el.style.color = "#6E6E73";
        ring.style.display = "none";
        wrap.classList.remove("ai-speaking");
      }
    }

    // ──────────────────────────────────────
    // Mode toggle
    // ──────────────────────────────────────
    function setMode(mode) {
      currentMode = mode;
      document.getElementById("audioModeBtn").classList.toggle("active", mode === "audio");
      document.getElementById("textModeBtn").classList.toggle("active", mode === "text");
      document.getElementById("audioPanel").style.display = mode === "audio" ? "block" : "none";
      document.getElementById("textPanel").style.display  = mode === "text"  ? "flex"  : "none";
      document.getElementById("micBtn").style.display    = mode === "audio" ? "flex"   : "none";

      if (mode === "audio") {
        stopCountdown();
        // Restart mic if switching to audio
        if (!isRecording && currentQ) startRecording();
      } else {
        stopRecording();
        document.getElementById("textAnswer").value = "";
        document.getElementById("textCharCount").textContent = "0 / 2000";
        startCountdown();
        checkNextReady();
      }
    }

    // ──────────────────────────────────────
    // Reset between questions
    // ──────────────────────────────────────
    function resetAnswerUI() {
      finalTranscript = "";
      stopRecording();
      stopCountdown();

      // Audio panel — safe sibling reset
      const ph = document.getElementById("audioPlaceholder");
      const at = document.getElementById("audioText");
      if (ph) ph.style.display = "flex";
      if (at) { at.style.display = "none"; at.textContent = ""; }
      document.getElementById("waveform").classList.add("hidden");
      const cc = document.getElementById("audioCharCount");
      if (cc) cc.textContent = "0 chars";

      // Text panel
      document.getElementById("textAnswer").value = "";
      document.getElementById("textCharCount").textContent = "0 / 2000";
      document.getElementById("textAnswer").classList.remove("warning");

      // Countdown reset
      countdownSecs = MAX_SECS;
      updateCountdownUI(MAX_SECS);

      // Next btn
      setNextReady(false);
    }

    // ──────────────────────────────────────
    // Speech Recognition (audio mode)
    // ──────────────────────────────────────
    function toggleMic() {
      if (isRecording) stopRecording();
      else startRecording();
    }

    function startRecording() {
      // Guard: don't start mic if user is in text mode
      if (currentMode !== "audio") return;
      if (!("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) {
        showToast("Speech recognition not supported. Use text mode.", "warning");
        setMode("text");
        return;
      }
      if (!recognition) setupRecognition();
      try {
        recognition.start();
        isRecording = true;
        updateMicUI(true);
        // Show/hide placeholder safely (they are now siblings, not parent/child)
        const ph = document.getElementById("audioPlaceholder");
        const at = document.getElementById("audioText");
        if (ph) ph.style.display = "none";
        if (at) at.style.display = "block";
        document.getElementById("waveform").classList.remove("hidden");
      } catch (e) { console.warn("startRecording failed:", e); }
    }

    function stopRecording() {
      if (recognition) recognition.stop();
      isRecording = false;
      updateMicUI(false);
      document.getElementById("waveform").classList.add("hidden");
      // Re-enable submit if we have captured speech
      const captured = finalTranscript.trim();
      if (captured.length > 8) setNextReady(true);
    }

    function updateMicUI(active) {
      const btn  = document.getElementById("micBtn");
      const icon = document.getElementById("micIcon");
      if (active) {
        btn.classList.add("recording");
        icon.className = "fas fa-stop";
      } else {
        btn.classList.remove("recording");
        icon.className = "fas fa-microphone";
      }
    }

    function setupRecognition() {
      const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition;
      recognition = new SpeechRecognition();
      recognition.continuous    = true;
      recognition.interimResults = true;

      recognition.onresult = (event) => {
        // Guard: ignore results if user switched to text mode
        if (currentMode !== "audio") return;

        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript + " ";
          } else {
            interim += event.results[i][0].transcript;
          }
        }
        const full = finalTranscript + interim;

        // Safe DOM updates — placeholder and text are now SIBLINGS (not parent/child)
        const ph = document.getElementById("audioPlaceholder");
        const at = document.getElementById("audioText");
        if (full.trim()) {
          if (ph) ph.style.display = "none";
          if (at) { at.style.display = "block"; at.textContent = full; }
        } else {
          if (ph) ph.style.display = "flex";
          if (at) { at.style.display = "none"; at.textContent = ""; }
        }
        const cc = document.getElementById("audioCharCount");
        if (cc) cc.textContent = full.trim().length + " chars";

        setNextReady(full.trim().length > 8);
      };

      recognition.onend = () => {
        if (isRecording) {
          // Keep-alive: restart if we're supposed to still be recording
          try { recognition.start(); } catch (e) {}
        } else {
          updateMicUI(false);
          // Re-check submit button with whatever was captured
          const captured = finalTranscript.trim();
          if (captured.length > 8) setNextReady(true);
        }
      };

      recognition.onerror = (e) => {
        if (e.error === "not-allowed") {
          showToast("Microphone access denied. Switch to text mode.", "danger");
          setMode("text");
        } else if (e.error === "aborted") {
          // Intentional stop — do nothing
        } else {
          showToast("Mic error: " + e.error + ". Try text mode.", "warning");
        }
      };
    }

    // ──────────────────────────────────────
    // Text mode setup
    // ──────────────────────────────────────
    function setupTextMode() {
      const ta = document.getElementById("textAnswer");

      // Block paste
      ta.addEventListener("paste", (e) => {
        e.preventDefault();
        showToast("Paste is not allowed during the interview.", "warning");
      });

      // Block right-click
      ta.addEventListener("contextmenu", (e) => e.preventDefault());

      // Block keyboard paste shortcuts
      ta.addEventListener("keydown", (e) => {
        const isCtrlV = (e.ctrlKey || e.metaKey) && e.key === "v";
        const isShiftIns = e.shiftKey && e.key === "Insert";
        if (isCtrlV || isShiftIns) {
          e.preventDefault();
          showToast("Paste is not allowed during the interview.", "warning");
        }
      });

      // Char counter + next toggle
      ta.addEventListener("input", () => {
        const len = ta.value.length;
        document.getElementById("textCharCount").textContent = len + " / 2000";
        setNextReady(ta.value.trim().length > 10);
      });
    }

    // ──────────────────────────────────────
    // 2-minute countdown (text mode only)
    // ──────────────────────────────────────
    function startCountdown() {
      stopCountdown();
      countdownSecs = MAX_SECS;
      updateCountdownUI(MAX_SECS);

      countdownInterval = setInterval(() => {
        countdownSecs--;
        updateCountdownUI(countdownSecs);

        if (countdownSecs <= 0) {
          stopCountdown();
          autoSubmitText();
        }
      }, 1000);
    }

    function stopCountdown() {
      if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
    }

    function updateCountdownUI(secs) {
      const fill = document.getElementById("countdownFill");
      const num  = document.getElementById("countdownNum");
      const ta   = document.getElementById("textAnswer");
      // Elements only exist when text panel is visible — guard
      if (!fill || !num) return;

      const m = Math.floor(secs / 60);
      const s = secs % 60;
      num.textContent  = String(m) + ":" + String(s).padStart(2, "0");
      fill.style.width = (Math.max(secs, 0) / MAX_SECS * 100) + "%";

      if (secs <= 20) {
        fill.className = "countdown-fill danger";
        num.className  = "countdown-num danger";
        if (ta) ta.classList.add("warning");
      } else if (secs <= 45) {
        fill.className = "countdown-fill hurry";
        num.className  = "countdown-num hurry";
        if (ta) ta.classList.remove("warning");
      } else {
        fill.className = "countdown-fill";
        num.className  = "countdown-num";
        if (ta) ta.classList.remove("warning");
      }
    }

    function autoSubmitText() {
      if (isSubmitting) return; // already in flight
      const text = document.getElementById("textAnswer").value.trim();
      if (text.length > 0) {
        showToast("Time's up! Submitting your answer…", "warning");
        setTimeout(() => submitAnswer(false), 800);
      } else {
        showToast("Time's up! Answer was blank — moving on.", "danger");
        submitAnswer(true);
      }
    }

    // ──────────────────────────────────────
    // Next button state
    // ──────────────────────────────────────
    function setNextReady(ready) {
      const btn = document.getElementById("nextBtn");
      btn.classList.toggle("ready", ready);
    }

    function checkNextReady() {
      const mode = currentMode;
      if (mode === "text") {
        const len = document.getElementById("textAnswer").value.trim().length;
        setNextReady(len > 10);
      } else {
        setNextReady(finalTranscript.trim().length > 8);
      }
    }

    // ──────────────────────────────────────
    // Submit answer
    // ──────────────────────────────────────
    async function submitAnswer(blank = false) {
      if (isSubmitting) return; // prevent double-submit
      isSubmitting = true;

      let answerText = "";
      if (currentMode === "audio") {
        // Use finalTranscript only — audioText.textContent mirrors it, don't double-concatenate
        answerText = finalTranscript.trim();
      } else {
        answerText = document.getElementById("textAnswer").value.trim();
      }

      if (!answerText && !blank) {
        showToast("Please provide an answer first.", "warning");
        isSubmitting = false;
        return;
      }
      if (!answerText) answerText = "[No answer provided]";

      stopRecording();
      stopCountdown();

      // UI: loading state
      const btn = document.getElementById("nextBtn");
      btn.classList.remove("ready");
      document.getElementById("nextBtnLabel").textContent = "Saving…";
      document.getElementById("nextBtnIcon").className = "fas fa-spinner fa-spin";

      // Add to transcript
      addBubble(currentQ, answerText);
      answers[currentQ] = answerText;
      conversationHistory.push({ question: currentQ, answer: answerText });

      try {
        const nextNum = currentQIndex + 1;
        const res = await fetch(`/next-question/${spaceId}/${roundName}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationHistory, currentQuestionNumber: nextNum })
        });
        const data = await res.json();

        if (data.done) {
          finishInterview();
        } else {
          currentQ      = data.question;
          currentQIndex = data.questionNumber;
          updateProgress(currentQIndex, totalQs);
          resetAnswerUI();
          showQuestion(currentQ);
          document.getElementById("nextBtnLabel").textContent = "Submit";
          document.getElementById("nextBtnIcon").className = "fas fa-arrow-right";
          // Restart countdown only if currently in text mode
          if (currentMode === "text") startCountdown();
        }
      } catch (e) {
        showToast("Network error — please try again.", "danger");
        document.getElementById("nextBtnLabel").textContent = "Retry";
        document.getElementById("nextBtnIcon").className = "fas fa-redo";
        btn.classList.add("ready");
      } finally {
        isSubmitting = false;
      }
    }

    // ──────────────────────────────────────
    // Finish interview
    // ──────────────────────────────────────
    async function finishInterview() {
      document.getElementById("evalOverlay").classList.add("show");
      try {
        const res = await fetch(`/finish-round/${spaceId}/${roundName}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers })
        });
        if (!res.ok) throw new Error("Server returned " + res.status);
      } catch (e) {
        console.error("finishInterview fetch failed:", e);
        // Still redirect — the server may have partial data; redirect shows space page
        showToast("Saving results... redirecting.", "warning");
      }
      // Small delay to let the user see the eval overlay
      setTimeout(() => { window.location.href = `/space/${spaceId}`; }, 1200);
    }

    // ──────────────────────────────────────
    // Transcript bubbles
    // ──────────────────────────────────────
    function addBubble(q, a) {
      const scroll = document.getElementById("transcriptScroll");
      document.getElementById("transcriptEmpty").style.display = "none";

      const html = `
        <div class="bubble bubble-ai">
          <div class="bubble-label">
            <i class="fas fa-robot" style="font-size:8px;"></i> AI Recruiter
          </div>
          <div class="bubble-body">${escapeHtml(q)}</div>
        </div>
        <div class="bubble bubble-user">
          <div class="bubble-label">
            <i class="fas fa-user" style="font-size:8px;"></i> You
          </div>
          <div class="bubble-body">${escapeHtml(a)}</div>
        </div>`;

      scroll.insertAdjacentHTML("beforeend", html);
      scroll.scrollTop = scroll.scrollHeight;
    }

    function escapeHtml(str) {
      return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    }

    // ──────────────────────────────────────
    // Camera toggle
    // ──────────────────────────────────────
    function toggleCamera() {
      const btn  = document.getElementById("cameraBtn");
      const icon = document.getElementById("cameraIcon");
      if (!mediaStream) return;
      const track = mediaStream.getVideoTracks()[0];
      if (!track) return;
      track.enabled = !track.enabled;
      if (track.enabled) {
        icon.className = "fas fa-video";
        btn.classList.remove("danger");
        document.getElementById("noCam").style.display = "none";
      } else {
        icon.className = "fas fa-video-slash";
        btn.classList.add("danger");
        document.getElementById("noCam").style.display = "flex";
      }
    }

    // ──────────────────────────────────────
    // Progress
    // ──────────────────────────────────────
    function updateProgress(curr, tot) {
      document.getElementById("progressText").textContent = `Q ${curr} of ${tot}`;
      document.getElementById("progressBar").style.width  = (curr / tot * 100) + "%";
    }

    // ──────────────────────────────────────
    // Toast
    // ──────────────────────────────────────
    let toastTimer = null;
    function showToast(msg, type = "info") {
      const toast = document.getElementById("toast");
      const icon  = toast.querySelector("i");
      document.getElementById("toastMsg").textContent = msg;
      icon.style.color = type === "danger" ? "var(--danger)" : type === "warning" ? "var(--warning)" : "var(--accent)";
      toast.classList.add("show");
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
    }

    // ── Load voices as soon as possible ──
    if ("speechSynthesis" in window) {
      speechSynthesis.getVoices();
      speechSynthesis.addEventListener("voiceschanged", () => speechSynthesis.getVoices());
    }

    // ──────────────────────────────────────────────────
    // Health Check Engine
    // ──────────────────────────────────────────────────
    let healthPanelOpen = false;
    let serverPingOk    = null; // null = not tested, true/false = result
    let lastInitError   = null; // set in initInterview if fetch fails

    function toggleHealthPanel() {
      healthPanelOpen = !healthPanelOpen;
      const panel = document.getElementById("healthPanel");
      panel.classList.toggle("open", healthPanelOpen);
      if (healthPanelOpen) runHealthCheck();
    }

    async function runHealthCheck() {
      const icon = document.getElementById("hcRefreshIcon");
      if (icon) icon.classList.add("fa-spin");

      const rows = [];

      // ── 1. Speech Recognition ──
      const srSupport = "webkitSpeechRecognition" in window || "SpeechRecognition" in window;
      rows.push({
        component: "Speech Recognition",
        status: srSupport ? "ok" : "fail",
        label:  srSupport ? "Supported" : "Not Supported",
        detail: srSupport ? "Browser web speech API available" : "Use text mode instead",
      });

      // ── 2. Text-to-Speech ──
      const ttsSupport = "speechSynthesis" in window;
      rows.push({
        component: "Text-to-Speech (TTS)",
        status: ttsSupport ? "ok" : "warn",
        label:  ttsSupport ? "Available" : "Unavailable",
        detail: ttsSupport ? "AI questions will be read aloud" : "Questions visible on screen only",
      });

      // ── 3. getUserMedia API ──
      const mediaApi = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
      rows.push({
        component: "Media API",
        status: mediaApi ? "ok" : "fail",
        label:  mediaApi ? "Available" : "Missing",
        detail: mediaApi ? "Camera & mic API accessible" : "Browser does not support getUserMedia",
      });

      // ── 4. Camera Stream ──
      const camTrack   = mediaStream && mediaStream.getVideoTracks()[0];
      const camActive  = camTrack && camTrack.readyState === "live";
      const camEnabled = camTrack && camTrack.enabled;
      rows.push({
        component: "Camera",
        status: camActive ? (camEnabled ? "ok" : "warn") : "fail",
        label:  camActive ? (camEnabled ? "Active" : "Muted") : "Not Available",
        detail: camActive ? (camEnabled ? "Video track live & enabled" : "Track live but toggled off") : "Camera denied or unavailable",
      });

      // ── 5. Microphone Stream ──
      const micTrack   = mediaStream && mediaStream.getAudioTracks()[0];
      const micActive  = micTrack && micTrack.readyState === "live";
      rows.push({
        component: "Microphone",
        status: micActive ? "ok" : "fail",
        label:  micActive  ? "Active" : "Not Available",
        detail: micActive  ? "Audio track live — voice input ready" : "Mic denied or unavailable",
      });

      // ── 6. Network ──
      const online = navigator.onLine;
      rows.push({
        component: "Network",
        status: online ? "ok" : "fail",
        label:  online ? "Online" : "Offline",
        detail: online ? "Browser reports network connectivity" : "No internet — answers may fail to save",
      });

      // ── 7. AI Server Ping ──
      let pingStatus = "warn", pingLabel = "Pinging…", pingDetail = "Testing server response…";
      try {
        const t0  = Date.now();
        const res = await fetch("/health", { method: "GET", signal: AbortSignal.timeout(4000) });
        const ms  = Date.now() - t0;
        if (res.ok) {
          pingStatus = "ok";
          pingLabel  = "Reachable (" + ms + "ms)";
          pingDetail = "Server responded OK · latency " + ms + "ms";
          serverPingOk = true;
        } else {
          pingStatus = "warn";
          pingLabel  = "Degraded (HTTP " + res.status + ")";
          pingDetail = "Server responded with error status";
          serverPingOk = false;
        }
      } catch (err) {
        pingStatus = "fail";
        pingLabel  = "Unreachable";
        pingDetail = err.name === "TimeoutError" ? "Request timed out (>4s)" : "Network or CORS error";
        serverPingOk = false;
      }
      rows.push({
        component: "AI Server",
        status: pingStatus,
        label:  pingLabel,
        detail: pingDetail,
      });

      // ── 8. Interview Session ──
      const qLoaded = currentQ && currentQ.length > 0;
      rows.push({
        component: "Question Loaded",
        status: qLoaded ? "ok" : (lastInitError ? "fail" : "warn"),
        label:  qLoaded ? "Yes" : (lastInitError ? "Failed" : "Loading"),
        detail: qLoaded ? "'" + currentQ.substring(0, 50) + (currentQ.length > 50 ? "…" : "") + "'" : (lastInitError || "Waiting for server"),
      });

      // ── 9. Progress ──
      rows.push({
        component: "Progress",
        status: "info",
        label:  "Q " + currentQIndex + " of " + totalQs,
        detail: "Questions answered: " + Object.keys(answers).length,
      });

      // ── 10. Input Mode ──
      rows.push({
        component: "Input Mode",
        status: "info",
        label:  currentMode === "audio" ? "🎙 Audio" : "⌨ Text",
        detail: currentMode === "audio" ? "Speaking via microphone" : "Typing answer (2-min timer active)",
      });

      // ── 11. Recording State ──
      rows.push({
        component: "Recording",
        status: isRecording ? "ok" : "warn",
        label:  isRecording ? "Active" : "Idle",
        detail: isRecording ? "Mic is capturing speech" : "Mic stopped — tap mic button to resume",
      });

      // ── 12. Countdown (text mode only) ──
      if (currentMode === "text") {
        const urgent = countdownSecs <= 20;
        rows.push({
          component: "Answer Timer",
          status: urgent ? "fail" : (countdownSecs <= 45 ? "warn" : "ok"),
          label:  Math.floor(countdownSecs / 60) + ":" + String(countdownSecs % 60).padStart(2, "0") + " remaining",
          detail: urgent ? "Under 20 seconds — submit soon!" : "Time remaining to answer",
        });
      }

      // ── Build table ──
      const tbody = document.getElementById("hcTableBody");
      if (!tbody) return;

      tbody.innerHTML = rows.map(row => {
        const cls = row.status === "ok"   ? "hc-ok"   :
                    row.status === "warn" ? "hc-warn" :
                    row.status === "fail" ? "hc-fail" : "hc-info";
        const ico = row.status === "ok"   ? "fa-check-circle" :
                    row.status === "warn" ? "fa-exclamation-circle" :
                    row.status === "fail" ? "fa-times-circle" : "fa-info-circle";
        return `<tr>
          <td class="hc-component">${row.component}</td>
          <td><span class="hc-badge ${cls}"><i class="fas ${ico}" style="font-size:9px;"></i>${row.label}</span></td>
          <td class="hc-detail">${row.detail}</td>
        </tr>`;
      }).join("");

      // Timestamp
      const ts = document.getElementById("hcTimestamp");
      if (ts) ts.textContent = "Last checked: " + new Date().toLocaleTimeString();

      // Update health button pulse
      const issues = rows.filter(r => r.status === "fail" || r.status === "warn").length;
      const btn    = document.getElementById("healthBtn");
      if (btn) btn.classList.toggle("has-issue", issues > 0);

      if (icon) icon.classList.remove("fa-spin");
    }

    // Run a silent health check after interview loads (to light up the button if issues found)
    setTimeout(runHealthCheck, 3000);
  