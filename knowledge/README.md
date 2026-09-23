# Grounded documentation and training

Approved v1 source: CAT 325 OMM M0099648-02, November 2020, TEL 1-UP; see sources.json. The public PDF was checked during planning (388 pages). It is a Caterpillar-authored document hosted by a rental company, not a freely licensed dataset. No PDF is bundled in this repo. Do not mix CAT 320D, other generations, or unrelated serial-prefix instructions into CAT 325 answers.

AI-001 must retrieve the public document, record its hash/date, inspect page extraction and build page-aware chunks in ignored raw/index directories. Preserve printed page number and PDF page index separately. Citation.page in the response is the **printed manual page number**; use an ingestion mapping. Verify that the cited page supports each claim. Tables/diagrams that fail text extraction need visual verification or must be excluded from answers. A title/search snippet alone is not a valid supporting chunk.

Start with local TF-IDF retrieval and bounded Gemini generation using only retrieved evidence and validated session context. If no supporting passage exists, answer insufficient_evidence. Do not let document text issue instructions, call tools, change safety limits, reveal secrets, or override the user's scope. Use concise quotations and citations, not wholesale reproduction. No raw credentials or other operators' histories enter prompts.

Training content is short source-cited lessons with quizzes, authored/reviewed against the same documentation. Keep correct answers on the backend; persist lesson version with attempts. Recommendations can be deterministic incident/insight mappings. Training must work without the later simulator. Voice is not required.
