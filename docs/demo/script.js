const adapterDetails = {
  claude: {
    title: "Claude Code output",
    copy:
      "Emits the full Claude posture: identity, settings, hooks, telemetry helpers, pruning scripts, and universal skills.",
    check: "doctor",
  },
  codex: {
    title: "Codex output",
    copy:
      "Builds an AGENTS.md-centered workspace with notify hooks, local skill routing, memory pointers, and portable scripts.",
    check: "verify",
  },
  cursor: {
    title: "Cursor output",
    copy:
      "Creates .cursorrules, modern .cursor/rules files, and a watcher that refreshes local skill rules from SKILL.md files.",
    check: "cursor",
  },
  generic: {
    title: "Generic output",
    copy:
      "Produces the lowest-common-denominator setup: AGENTS.md, memory notes, setup checklist, and portable helper scripts.",
    check: "pack",
  },
};

const cards = document.querySelectorAll(".adapter-card");
const title = document.querySelector("#adapter-title");
const copy = document.querySelector("#adapter-copy");
const checks = document.querySelectorAll(".check-list li");
const checkList = document.querySelector(".check-list");
const runDemo = document.querySelector("#run-demo");

function selectAdapter(adapter) {
  const detail = adapterDetails[adapter];
  if (!detail) return;

  cards.forEach((card) => {
    card.classList.toggle("active", card.dataset.adapter === adapter);
  });

  checks.forEach((check) => {
    check.classList.toggle("highlight", check.dataset.check === detail.check);
  });

  title.textContent = detail.title;
  copy.textContent = detail.copy;
}

cards.forEach((card) => {
  card.addEventListener("click", () => selectAdapter(card.dataset.adapter));
});

runDemo.addEventListener("click", () => {
  checkList.classList.remove("pulse");
  window.requestAnimationFrame(() => {
    checkList.classList.add("pulse");
  });
});

document.querySelectorAll("[data-copy]").forEach((button) => {
  button.addEventListener("click", async () => {
    const value = button.dataset.copy;
    try {
      await navigator.clipboard.writeText(value);
      const original = button.textContent;
      button.textContent = "Copied command";
      window.setTimeout(() => {
        button.textContent = original;
      }, 1300);
    } catch {
      button.textContent = value;
    }
  });
});

selectAdapter("claude");
