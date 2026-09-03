(function () {
  "use strict";

  var meetingSample = [
    "Project check-in — September 2",
    "",
    "Maya showed the first version of our AI study helper. The group agreed that the first demo should focus only on turning class notes into a five-question quiz. Jordan will test the demo with three classmates and bring feedback to our next meeting. We decided to present the project in class next Friday. Cruz will clean up the landing page before the presentation. Nobody was assigned to write the setup guide, and no deadline was selected for it.",
    "",
    "Next meeting: Tuesday at 4:00 PM in the library."
  ].join("\n");

  var contentSample = [
    "I built a small AI study helper for class. It takes a page of notes and turns the main ideas into five practice questions. I kept the first version intentionally simple: one text box, one API route, and one structured response. Building fewer features helped me understand the full path from the browser to the AI model and back. My next step is to test whether the questions actually help classmates remember the material."
  ].join("\n");

  function byId(id) {
    return document.getElementById(id);
  }

  function setText(id, value) {
    var element = byId(id);
    if (element) {
      element.textContent = value;
    }
  }

  function updateCount(textareaId, counterId) {
    var textarea = byId(textareaId);
    var counter = byId(counterId);
    if (textarea && counter) {
      counter.textContent = String(textarea.value.length);
    }
  }

  function setList(id, items, emptyMessage) {
    var list = byId(id);
    if (!list) {
      return;
    }
    list.replaceChildren();
    var values = items.length > 0 ? items : [emptyMessage];
    values.forEach(function (item) {
      var li = document.createElement("li");
      li.textContent = item;
      list.appendChild(li);
    });
  }

  function setBusy(form, busy, busyLabel) {
    var button = form.querySelector(".submit-button");
    var label = button ? button.querySelector(".button-label") : null;
    if (!button || !label) {
      return;
    }

    if (!button.dataset.originalLabel) {
      button.dataset.originalLabel = label.textContent || "Run workflow";
    }
    button.disabled = busy;
    button.classList.toggle("is-loading", busy);
    label.textContent = busy ? busyLabel : button.dataset.originalLabel;
    form.setAttribute("aria-busy", String(busy));
  }

  function showError(id, message) {
    var box = byId(id);
    if (!box) {
      return;
    }
    box.textContent = message;
    box.hidden = !message;
  }

  function revealResults(emptyId, resultId) {
    var empty = byId(emptyId);
    var results = byId(resultId);
    if (empty) {
      empty.hidden = true;
    }
    if (results) {
      results.hidden = false;
      window.setTimeout(function () {
        results.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 80);
    }
  }

  async function postJson(path, payload) {
    var response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    var body;
    try {
      body = await response.json();
    } catch (_error) {
      throw new Error("The server returned an unreadable response.");
    }

    if (!response.ok) {
      throw new Error(
        body && typeof body.error === "string"
          ? body.error
          : "The workflow could not finish."
      );
    }
    if (!body || typeof body !== "object" || !body.data) {
      throw new Error("The workflow returned no result.");
    }
    return body.data;
  }

  function renderMeeting(data) {
    setText("meeting-result-title", data.title);
    setText("meeting-summary", data.summary);
    setText("meeting-email", data.followUpEmail);
    setList(
      "meeting-decisions",
      Array.isArray(data.decisions) ? data.decisions : [],
      "No explicit decisions were found."
    );

    var tbody = byId("meeting-actions-body");
    if (tbody) {
      tbody.replaceChildren();
      var actions = Array.isArray(data.actionItems) ? data.actionItems : [];
      if (actions.length === 0) {
        var emptyRow = document.createElement("tr");
        var emptyCell = document.createElement("td");
        emptyCell.colSpan = 3;
        emptyCell.textContent = "No explicit action items were found.";
        emptyRow.appendChild(emptyCell);
        tbody.appendChild(emptyRow);
      } else {
        actions.forEach(function (action) {
          var row = document.createElement("tr");
          ["task", "owner", "dueDate"].forEach(function (key) {
            var cell = document.createElement("td");
            cell.textContent =
              action && typeof action[key] === "string" ? action[key] : "Not specified";
            row.appendChild(cell);
          });
          tbody.appendChild(row);
        });
      }
    }

    revealResults("meeting-empty", "meeting-results");
  }

  function renderContent(data) {
    setText("content-core", data.coreMessage);
    setText("content-linkedin", data.linkedinPost);
    setText("content-newsletter", data.newsletterBlurb);
    setList(
      "content-thread",
      Array.isArray(data.shortThread) ? data.shortThread : [],
      "No thread was generated."
    );
    setList(
      "content-titles",
      Array.isArray(data.titleIdeas) ? data.titleIdeas : [],
      "No titles were generated."
    );

    var hashtagList = byId("content-hashtags");
    if (hashtagList) {
      hashtagList.replaceChildren();
      var hashtags = Array.isArray(data.hashtags) ? data.hashtags : [];
      if (hashtags.length === 0) {
        hashtags = ["No hashtags suggested"];
      }
      hashtags.forEach(function (hashtag) {
        var chip = document.createElement("span");
        var value = String(hashtag);
        chip.textContent =
          value === "No hashtags suggested" || value.charAt(0) === "#"
            ? value
            : "#" + value.replace(/\s+/g, "");
        hashtagList.appendChild(chip);
      });
    }

    revealResults("content-empty", "content-results");
  }

  function activateTab(name, focusTab) {
    var tabs = document.querySelectorAll("[data-workflow-tab]");
    tabs.forEach(function (tab) {
      var active = tab.getAttribute("data-workflow-tab") === name;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
      if (active && focusTab) {
        tab.focus();
      }
    });

    var meetingPanel = byId("meeting-panel");
    var contentPanel = byId("content-panel");
    if (meetingPanel) {
      meetingPanel.hidden = name !== "meeting";
    }
    if (contentPanel) {
      contentPanel.hidden = name !== "content";
    }
  }

  function showToast(message) {
    var toast = byId("toast");
    if (!toast) {
      return;
    }
    toast.textContent = message;
    toast.hidden = false;
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(function () {
      toast.hidden = true;
    }, 1800);
  }

  showToast.timer = 0;

  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }

    var temporary = document.createElement("textarea");
    temporary.value = text;
    temporary.setAttribute("readonly", "");
    temporary.style.position = "fixed";
    temporary.style.opacity = "0";
    document.body.appendChild(temporary);
    temporary.select();
    document.execCommand("copy");
    temporary.remove();
  }

  document.querySelectorAll("[data-workflow-tab]").forEach(function (tab) {
    tab.addEventListener("click", function () {
      activateTab(tab.getAttribute("data-workflow-tab"), false);
    });
    tab.addEventListener("keydown", function (event) {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
        return;
      }
      event.preventDefault();
      var next = tab.getAttribute("data-workflow-tab") === "meeting" ? "content" : "meeting";
      activateTab(next, true);
    });
  });

  var meetingText = byId("meeting-text");
  var contentText = byId("content-text");

  if (meetingText) {
    meetingText.addEventListener("input", function () {
      updateCount("meeting-text", "meeting-count");
    });
  }
  if (contentText) {
    contentText.addEventListener("input", function () {
      updateCount("content-text", "content-count");
    });
  }

  var meetingSampleButton = byId("meeting-sample");
  if (meetingSampleButton && meetingText) {
    meetingSampleButton.addEventListener("click", function () {
      meetingText.value = meetingSample;
      updateCount("meeting-text", "meeting-count");
      showError("meeting-error", "");
      meetingText.focus();
    });
  }

  var contentSampleButton = byId("content-sample");
  if (contentSampleButton && contentText) {
    contentSampleButton.addEventListener("click", function () {
      contentText.value = contentSample;
      updateCount("content-text", "content-count");
      showError("content-error", "");
      contentText.focus();
    });
  }

  var meetingForm = byId("meeting-form");
  if (meetingForm) {
    meetingForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      showError("meeting-error", "");
      setBusy(meetingForm, true, "Building your action plan…");
      try {
        var data = await postJson("/api/meeting-plan", {
          text: meetingText ? meetingText.value : ""
        });
        renderMeeting(data);
      } catch (error) {
        showError(
          "meeting-error",
          error instanceof Error ? error.message : "Something went wrong."
        );
      } finally {
        setBusy(meetingForm, false, "");
      }
    });
  }

  var contentForm = byId("content-form");
  if (contentForm) {
    contentForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      showError("content-error", "");
      setBusy(contentForm, true, "Creating your content kit…");
      try {
        var data = await postJson("/api/repurpose", {
          text: contentText ? contentText.value : "",
          audience: byId("content-audience").value,
          tone: byId("content-tone").value,
          callToAction: byId("content-cta").value
        });
        renderContent(data);
      } catch (error) {
        showError(
          "content-error",
          error instanceof Error ? error.message : "Something went wrong."
        );
      } finally {
        setBusy(contentForm, false, "");
      }
    });
  }

  document.addEventListener("click", async function (event) {
    var target = event.target;
    var button = target && target.closest ? target.closest("[data-copy-target]") : null;
    if (!button) {
      return;
    }

    var targetId = button.getAttribute("data-copy-target");
    var source = targetId ? byId(targetId) : null;
    var text = source ? (source.innerText || source.textContent || "").trim() : "";
    if (!text) {
      return;
    }

    try {
      await copyText(text);
      showToast("Copied to clipboard");
    } catch (_error) {
      showToast("Copy did not work");
    }
  });

  async function checkHealth() {
    var dot = byId("api-status-dot");
    try {
      var response = await fetch("/api/health", {
        headers: { Accept: "application/json" }
      });
      if (!response.ok) {
        throw new Error("Offline");
      }
      setText("api-status-text", "API online");
      if (dot) {
        dot.classList.add("is-online");
        dot.classList.remove("is-offline");
      }
    } catch (_error) {
      setText("api-status-text", "API unavailable");
      if (dot) {
        dot.classList.add("is-offline");
        dot.classList.remove("is-online");
      }
    }
  }

  setText("year", String(new Date().getFullYear()));
  updateCount("meeting-text", "meeting-count");
  updateCount("content-text", "content-count");
  activateTab("meeting", false);
  checkHealth();
})();
