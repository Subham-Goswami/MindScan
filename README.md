MindScan — FastAPI + Jinja2 (no React / no Node.js)
=====================================================

This is the complete MindScan mental-wellness self-assessment web app,
running entirely on Python. The old React / TanStack Start / Vite / TypeScript
frontend has been fully removed and rebuilt as plain HTML + CSS + JavaScript,
served by FastAPI through Jinja2 templates. There is nothing to `npm install`
or `npm run` — only Python.

What's inside
--------------
- app.py                                   FastAPI app: routes, ML model loading,
                                            prediction logic (/predict), and the
                                            optional step-by-step questionnaire API.
- depression_logistic_regression_model.joblib   The trained scikit-learn model (unchanged).
- templates/index.html                     The single-page MindScan UI (Jinja2 template).
- static/css/style.css                     All styling — a hand-written CSS port of the
                                            original Tailwind design (same colors, fonts,
                                            spacing, radii, and animations).
- static/js/app.js                         All client-side behavior — a vanilla-JS port
                                            of the original React state machine
                                            (Landing → About You → Questionnaire →
                                            Mood Tracker → loading → Results →
                                            Recommendations), calling POST /predict
                                            exactly like the React version did.
- requirements.txt                         Python dependencies only.
- run_mindscan.bat                         Convenience launcher for Windows.

How to run
-----------
1. Open this folder in VS Code (or any terminal).
2. Create and activate a virtual environment:

   python -m venv venv
   venv\Scripts\activate        (Windows)
   source venv/bin/activate     (macOS/Linux)

3. Install dependencies:

   pip install -r requirements.txt

4. Start the app:

   uvicorn app:app --reload

   (or just double-click run_mindscan.bat on Windows)

5. Open in your browser:

   http://127.0.0.1:8000

Everything — the landing page, the "About You" step, the 12-question
assessment, the mood tracker, the loading state, the animated result ring,
the depressed / not-depressed scores, the risk-based recommendations, and the
crisis-support note for high-risk answers — runs on this one page, exactly as
it did in the React app, with no separate frontend server and no CORS
configuration needed (the browser only ever talks to this same FastAPI app).

What changed from the original two projects
----------------------------------------------
- The ML model, the /predict endpoint, the Pydantic request/response models,
  and the build_profile()/make_prediction() logic are unchanged — copied
  directly from the original FastAPI backend.
- The old backend's inline-HTML marketing pages (/about, /learn, /resources,
  /methodology, and the old-style /questionnaire page) belonged to a
  different, earlier site design and have been removed in favor of the
  MindScan UI, which now lives at "/".
- The React frontend (all .tsx components, TanStack Start server functions,
  Vite config, package.json, node_modules, etc.) has been removed entirely
  and replaced by templates/index.html + static/css/style.css +
  static/js/app.js.
- The optional /questionnaire/start and /questionnaire/answer step-by-step
  API endpoints were kept in case you want to drive the same model from a
  non-browser client; the website itself doesn't use them (it submits the
  whole questionnaire at once, exactly like before).

Note: This is an academic self-assessment tool, not a medical diagnosis.
