// =============================================================================
// MindScan — client-side app logic
// A direct vanilla-JS port of the original React state machine
// (Landing -> AboutYou -> Questionnaire -> MoodTracker -> loading -> Results).
// Talks to the FastAPI backend at POST /predict, same as before.
// =============================================================================

(function () {
  "use strict";

  // ---------------------------------------------------------------------
  // Data (ported 1:1 from src/lib/assessment.ts)
  // ---------------------------------------------------------------------
  const FREQ = [
    { label: "Not at all", value: 0 },
    { label: "Several days", value: 1 },
    { label: "More than half the days", value: 2 },
    { label: "Nearly every day", value: 3 },
  ];

  const QUESTIONS = [
    { id: "mood", category: "Mood", text: "Feeling down, depressed, or hopeless?", options: FREQ },
    { id: "interest", category: "Interest", text: "Little interest or pleasure in doing things?", options: FREQ },
    { id: "sleep", category: "Sleep", text: "Trouble falling asleep, staying asleep, or sleeping too much?", options: FREQ },
    { id: "energy", category: "Energy", text: "Feeling tired or having little energy?", options: FREQ },
    { id: "appetite", category: "Appetite", text: "Poor appetite or overeating?", options: FREQ },
    { id: "selfworth", category: "Self-worth", text: "Feeling bad about yourself, or that you are a failure?", options: FREQ },
    { id: "concentration", category: "Concentration", text: "Trouble concentrating on things like reading or watching TV?", options: FREQ },
    { id: "motivation", category: "Motivation", text: "Lack of motivation to start or finish daily tasks?", options: FREQ },
    { id: "social", category: "Social", text: "Avoiding social interactions or withdrawing from people?", options: FREQ },
    { id: "future", category: "Future outlook", text: "Feeling pessimistic about the future?", options: FREQ },
    { id: "restless", category: "Restlessness", text: "Moving or speaking slowly, or feeling restless and fidgety?", options: FREQ },
    { id: "selfharm", category: "Safety", text: "Thoughts that you would be better off dead or of hurting yourself?", options: FREQ },
  ];

  function buildModelPayload(answers, about) {
    const a = (id) => (answers[id] !== undefined ? answers[id] : 0);
    return {
      gender: about.gender,
      age: about.age,
      sadness: a("mood"),
      tiredness: a("energy"),
      sleep_problem: a("sleep"),
      hopelessness: a("future"),
      lost_interest: a("interest"),
      concentration_problem: a("concentration"),
      anxiety: a("restless"),
      loneliness: a("social"),
      guilt: a("selfworth"),
      mood_changes: a("appetite"),
      suicidal_thoughts: a("selfharm"),
      study_pressure: a("motivation"),
    };
  }

  // Ported from components/MoodTracker.tsx
  const MOODS = [
    { emoji: "😀", label: "Happy" },
    { emoji: "🙂", label: "Okay" },
    { emoji: "😐", label: "Neutral" },
    { emoji: "😔", label: "Sad" },
    { emoji: "😭", label: "Very Sad" },
  ];
  const COLORS = [
    { hex: "#facc15", name: "Yellow" },
    { hex: "#22c55e", name: "Green" },
    { hex: "#3b82f6", name: "Blue" },
    { hex: "#7f77dd", name: "Purple" },
    { hex: "#ef4444", name: "Red" },
    { hex: "#0a0a0a", name: "Black" },
    { hex: "#9ca3af", name: "Grey" },
  ];
  const WEEK = [
    { day: "Mon", val: 60 },
    { day: "Tue", val: 45 },
    { day: "Wed", val: 75 },
    { day: "Thu", val: 50 },
    { day: "Fri", val: 30 },
    { day: "Sat", val: 65 },
    { day: "Sun", val: 55 },
  ];

  // Ported from components/Results.tsx
  const RECS_LOW = [
    { icon: "🌱", title: "Keep your rhythm", desc: "Stay consistent with sleep, movement, and the things that recharge you." },
    { icon: "📓", title: "Daily reflection", desc: "Spend 3 minutes journaling one thing you noticed about yourself today." },
    { icon: "🤝", title: "Stay connected", desc: "Reach out to someone you trust — small check-ins matter." },
  ];
  const RECS_MID = [
    { icon: "🧘", title: "Try a breathing exercise", desc: "4-7-8 breathing for 2 minutes can ease tension fast." },
    { icon: "🚶", title: "10-minute walk", desc: "Outdoor light + light movement noticeably lifts mood." },
    { icon: "📞", title: "Talk to someone", desc: "A friend, family member, or counselor — sharing helps." },
    { icon: "📵", title: "Reduce stimulation", desc: "Try 30 minutes without screens before bed." },
  ];
  const RECS_HIGH = [
    { icon: "🆘", title: "Reach a crisis line", desc: "988 (US) · 116 123 (UK Samaritans) · iasp.info for global lines." },
    { icon: "👥", title: "Don't be alone", desc: "Stay with someone you trust until you can speak to a professional." },
    { icon: "🩺", title: "Book a clinician", desc: "A licensed therapist or doctor can guide next steps." },
  ];

  const TONE = {
    low: { tone: "success", emoji: "🟢", label: "Low" },
    moderate: { tone: "warning", emoji: "🟡", label: "Moderate" },
    high: { tone: "danger", emoji: "🔴", label: "High" },
  };

  function energyLabel(v) {
    if (v < 20) return "Exhausted";
    if (v < 40) return "Drained";
    if (v < 60) return "Steady";
    if (v < 80) return "Energetic";
    return "Energized";
  }

  // ---------------------------------------------------------------------
  // State (ported 1:1 from routes/index.tsx)
  // ---------------------------------------------------------------------
  const state = {
    stage: "landing", // landing | about | questions | mood | loading | error | results
    answers: {},
    qIndex: 0,
    mood: { moodIdx: null, colorIdx: null, energy: 50 },
    gender: null,
    age: "",
    result: null,
    error: null,
  };

  const STAGE_STEP = { landing: 0, about: 1, questions: 2, mood: 3, results: 4 };

  // ---------------------------------------------------------------------
  // DOM refs
  // ---------------------------------------------------------------------
  const els = {
    stepDots: document.getElementById("stepDots"),
    stages: {
      landing: document.getElementById("stage-landing"),
      about: document.getElementById("stage-about"),
      questions: document.getElementById("stage-questions"),
      mood: document.getElementById("stage-mood"),
      loading: document.getElementById("stage-loading"),
      error: document.getElementById("stage-error"),
      results: document.getElementById("stage-results"),
    },
    btnStart: document.getElementById("btnStart"),
    genderM: document.getElementById("genderM"),
    genderF: document.getElementById("genderF"),
    ageInput: document.getElementById("ageInput"),
    aboutBack: document.getElementById("aboutBack"),
    aboutNext: document.getElementById("aboutNext"),
    qCategory: document.getElementById("qCategory"),
    qCounter: document.getElementById("qCounter"),
    qProgress: document.getElementById("qProgress"),
    qText: document.getElementById("qText"),
    qOptions: document.getElementById("qOptions"),
    qBack: document.getElementById("qBack"),
    qNext: document.getElementById("qNext"),
    moodGrid: document.getElementById("moodGrid"),
    colorRow: document.getElementById("colorRow"),
    energyValue: document.getElementById("energyValue"),
    energySlider: document.getElementById("energySlider"),
    weekBars: document.getElementById("weekBars"),
    moodBack: document.getElementById("moodBack"),
    moodNext: document.getElementById("moodNext"),
    errorMessage: document.getElementById("errorMessage"),
    retryBtn: document.getElementById("retryBtn"),
    crisisAlert: document.getElementById("crisisAlert"),
    ringProgress: document.getElementById("ringProgress"),
    ringNumber: document.getElementById("ringNumber"),
    riskBadge: document.getElementById("riskBadge"),
    riskEmoji: document.getElementById("riskEmoji"),
    riskLabel: document.getElementById("riskLabel"),
    summaryMessage: document.getElementById("summaryMessage"),
    depressedScoreOut: document.getElementById("depressedScoreOut"),
    notDepressedScoreOut: document.getElementById("notDepressedScoreOut"),
    recsGrid: document.getElementById("recsGrid"),
    retakeBtn: document.getElementById("retakeBtn"),
  };

  // ---------------------------------------------------------------------
  // Stage / navbar rendering
  // ---------------------------------------------------------------------
  function showStage(stage) {
    state.stage = stage;
    Object.entries(els.stages).forEach(([key, el]) => {
      if (!el) return;
      const visible =
        key === stage ||
        // "results" stage also implies the results section only (loading/error are separate keys)
        false;
      el.classList.toggle("hidden", key !== stage);
    });
    renderStepDots();
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  }

  function renderStepDots() {
    const total = 5;
    const current =
      state.stage === "loading" || state.stage === "error"
        ? STAGE_STEP.mood
        : STAGE_STEP[state.stage] !== undefined
        ? STAGE_STEP[state.stage]
        : 0;
    els.stepDots.innerHTML = "";
    for (let i = 0; i < total; i++) {
      const dot = document.createElement("span");
      dot.className = "dot" + (i <= current ? " active" : "");
      els.stepDots.appendChild(dot);
    }
  }

  // ---------------------------------------------------------------------
  // Landing
  // ---------------------------------------------------------------------
  els.btnStart.addEventListener("click", () => showStage("about"));

  // ---------------------------------------------------------------------
  // About You
  // ---------------------------------------------------------------------
  function updateAboutValidity() {
    const ageNum = Number(state.age);
    const canContinue =
      state.gender !== null && state.age.trim() !== "" && ageNum >= 10 && ageNum <= 100;
    els.aboutNext.disabled = !canContinue;
  }

  function selectGender(g) {
    state.gender = g;
    els.genderM.classList.toggle("active", g === "M");
    els.genderF.classList.toggle("active", g === "F");
    updateAboutValidity();
  }

  els.genderM.addEventListener("click", () => selectGender("M"));
  els.genderF.addEventListener("click", () => selectGender("F"));
  els.ageInput.addEventListener("input", (e) => {
    state.age = e.target.value;
    updateAboutValidity();
  });

  els.aboutBack.addEventListener("click", () => showStage("landing"));
  els.aboutNext.addEventListener("click", () => {
    state.qIndex = 0;
    showStage("questions");
    renderQuestion();
  });

  // ---------------------------------------------------------------------
  // Questionnaire
  // ---------------------------------------------------------------------
  function renderQuestion() {
    const q = QUESTIONS[state.qIndex];
    const value = state.answers[q.id];
    const progress = ((state.qIndex + (value !== undefined ? 1 : 0)) / QUESTIONS.length) * 100;

    els.qCategory.textContent = q.category;
    els.qCounter.textContent = `${state.qIndex + 1} / ${QUESTIONS.length}`;
    els.qProgress.style.width = `${progress}%`;
    els.qText.textContent = q.text;

    els.qOptions.innerHTML = "";
    q.options.forEach((opt) => {
      const active = value === opt.value;
      const btn = document.createElement("button");
      btn.className = "option-row-btn" + (active ? " active" : "");
      btn.innerHTML = `
        <span class="opt-label">${opt.label}</span>
        <span class="option-radio"><span class="option-radio-dot"></span></span>
      `;
      btn.addEventListener("click", () => {
        state.answers[q.id] = opt.value;
        renderQuestion();
      });
      els.qOptions.appendChild(btn);
    });

    els.qNext.disabled = value === undefined;
    els.qNext.textContent = state.qIndex === QUESTIONS.length - 1 ? "Continue" : "Next →";

    // re-trigger fade-in each time the question changes, like React's key={q.id}
    const section = els.stages.questions;
    section.classList.remove("animate-fade-in");
    void section.offsetWidth;
    section.classList.add("animate-fade-in");
  }

  els.qBack.addEventListener("click", () => {
    if (state.qIndex === 0) {
      showStage("about");
    } else {
      state.qIndex -= 1;
      renderQuestion();
    }
  });

  els.qNext.addEventListener("click", () => {
    if (state.qIndex < QUESTIONS.length - 1) {
      state.qIndex += 1;
      renderQuestion();
    } else {
      showStage("mood");
      renderMood();
    }
  });

  // ---------------------------------------------------------------------
  // Mood Tracker
  // ---------------------------------------------------------------------
  function updateMoodValidity() {
    els.moodNext.disabled = !(state.mood.moodIdx !== null && state.mood.colorIdx !== null);
  }

  function renderMood() {
    els.moodGrid.innerHTML = "";
    MOODS.forEach((m, i) => {
      const active = state.mood.moodIdx === i;
      const btn = document.createElement("button");
      btn.className = "mood-btn" + (active ? " active" : "");
      btn.innerHTML = `<span class="mood-emoji">${m.emoji}</span><span class="mood-label">${m.label}</span>`;
      btn.addEventListener("click", () => {
        state.mood.moodIdx = i;
        renderMood();
        updateMoodValidity();
      });
      els.moodGrid.appendChild(btn);
    });

    els.colorRow.innerHTML = "";
    COLORS.forEach((c, i) => {
      const active = state.mood.colorIdx === i;
      const btn = document.createElement("button");
      btn.className = "color-btn" + (active ? " active" : "");
      btn.innerHTML = `<span class="color-swatch" style="background:${c.hex}"></span><span class="color-name">${c.name}</span>`;
      btn.addEventListener("click", () => {
        state.mood.colorIdx = i;
        renderMood();
        updateMoodValidity();
      });
      els.colorRow.appendChild(btn);
    });

    els.energySlider.value = state.mood.energy;
    els.energyValue.textContent = `${energyLabel(state.mood.energy)} · ${state.mood.energy}`;

    els.weekBars.innerHTML = "";
    WEEK.forEach((d) => {
      const col = document.createElement("div");
      col.className = "week-bar-col";
      col.innerHTML = `<div class="week-bar" style="height:${d.val}%"></div><span class="week-day-label">${d.day}</span>`;
      els.weekBars.appendChild(col);
    });

    updateMoodValidity();
  }

  els.energySlider.addEventListener("input", (e) => {
    state.mood.energy = Number(e.target.value);
    els.energyValue.textContent = `${energyLabel(state.mood.energy)} · ${state.mood.energy}`;
  });

  els.moodBack.addEventListener("click", () => {
    showStage("questions");
    renderQuestion();
  });

  els.moodNext.addEventListener("click", runPrediction);

  // ---------------------------------------------------------------------
  // Prediction
  // ---------------------------------------------------------------------
  async function runPrediction() {
    if (!state.gender) return;
    showStage("loading");
    state.error = null;
    try {
      const payload = buildModelPayload(state.answers, { gender: state.gender, age: Number(state.age) });
      const response = await fetch("/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`The prediction service returned an error (${response.status}). ${detail}`.trim());
      }

      const result = await response.json();
      state.result = result;
      showStage("results");
      renderResults(result);
    } catch (err) {
      state.error =
        err instanceof Error
          ? err.message
          : "Could not reach the prediction service. Make sure the FastAPI server is running.";
      showStage("error");
      els.errorMessage.textContent = state.error;
    }
  }

  els.retryBtn.addEventListener("click", runPrediction);

  // ---------------------------------------------------------------------
  // Results
  // ---------------------------------------------------------------------
  function renderResults(result) {
    const { depressed_score, not_depressed_score, risk_level, high_priority_support_note, message } = result;
    const info = TONE[risk_level];

    els.crisisAlert.classList.toggle("hidden", !high_priority_support_note);

    els.riskBadge.className = "risk-badge tone-" + info.tone;
    els.riskEmoji.textContent = info.emoji;
    els.riskLabel.textContent = info.label;
    els.summaryMessage.textContent = message;

    els.depressedScoreOut.textContent = `${depressed_score}%`;
    els.notDepressedScoreOut.textContent = `${not_depressed_score}%`;

    const recs = risk_level === "high" ? RECS_HIGH : risk_level === "moderate" ? RECS_MID : RECS_LOW;
    els.recsGrid.innerHTML = "";
    recs.forEach((r) => {
      const card = document.createElement("div");
      card.className = "rec-card";
      card.innerHTML = `
        <div class="rec-icon">${r.icon}</div>
        <div class="rec-title">${r.title}</div>
        <p class="rec-desc">${r.desc}</p>
      `;
      els.recsGrid.appendChild(card);
    });

    // Animated ring + counting number (ported from useEffect in Results.tsx)
    const radius = 80;
    const circ = 2 * Math.PI * radius;
    els.ringProgress.setAttribute("stroke-dasharray", String(circ));

    const start = performance.now();
    const duration = 1200;

    function tick(t) {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const animated = Math.round(depressed_score * eased);
      els.ringNumber.textContent = String(animated);
      const offset = circ - (animated / 100) * circ;
      els.ringProgress.setAttribute("stroke-dashoffset", String(offset));
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function resetAll() {
    state.answers = {};
    state.qIndex = 0;
    state.mood = { moodIdx: null, colorIdx: null, energy: 50 };
    state.gender = null;
    state.age = "";
    state.result = null;
    state.error = null;

    els.genderM.classList.remove("active");
    els.genderF.classList.remove("active");
    els.ageInput.value = "";
    updateAboutValidity();

    showStage("landing");
  }

  els.retakeBtn.addEventListener("click", resetAll);

  // ---------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------
  renderStepDots();
})();
