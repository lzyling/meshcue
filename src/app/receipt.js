import { newId } from "../browser-crypto.js";

import { t, ta, currentLocale } from "../i18n/index.js";
export function installReceipt(review) {
  function showFeedback(line, detail = "") {
    review.$("#feedback-line").textContent = line;
    review.$("#feedback-detail").textContent = detail;
    review.$("#feedback-detail").hidden = !detail;
  }

  function updateReceipt() {
    if (review.submitting) return;
    const last = review.state?.submissions?.findLast(
      (s) => s.versionId === review.loadedId,
    );
    // What to say where nobody will be told: a host with no way to push.
    const unheard =
      !!last && !last.readAt && !last.sealed && !review.state?.notifier?.send;
    review.$("#receipt-nudge").hidden = !unheard;
    if (unheard) review.showNudge(last);
    review.$("#feedback-status").classList.toggle("sent", !!last);
    if (!last) {
      review.showFeedback(
        review.annotations.length
          ? t("feedback.notSubmitted")
          : t("feedback.default"),
      );
      return;
    }
    // A batch saved before the count was kept is the draft it was cut from.
    const count = last.markCount ?? review.annotations.length;
    const later =
      review.editSeq > review.savedSeq || review.revision !== last.revision
        ? t("feedback.alsoUnsubmitted")
        : "";
    const sent = t("feedback.sentCount", { count });
    if (!last.readAt) {
      /* Where the host pushes, how far the push got. "accepted" is not
       "delivered", and a host with nowhere to push has nothing to report
       here: the note below it says what to do instead. */
      const delivery = !review.state?.notifier?.send
        ? ""
        : last.deliveredAt
          ? t("feedback.delivered")
          : last.status === "accepted"
            ? t("feedback.acceptedPending")
            : t("feedback.deliveryUnconfirmed");
      review.showFeedback(
        `${sent} · ${ta("feedback.unread")}${later}`,
        delivery,
      );
      return;
    }
    const echo =
      review.state?.echo?.submissionId === last.id ? review.state.echo : null;
    review.showFeedback(
      `${sent} · ${ta("feedback.read")} · ${review.clock(last.readAt)}${later}`,
      echo
        ? ta("receipt.understood", { time: review.clock(echo.createdAt) })
        : ta("receipt.next"),
    );
  }

  /* A host reached over a tool protocol cannot be woken: the batch waits until
   the Agent is asked about it. So the page says so, and hands the reviewer a
   sentence to paste into that conversation, in their own language, naming
   exactly what `read` needs. */
  function nudgeLine(last) {
    const vars = {
      count: last.markCount ?? review.annotations.length,
      project: review.state?.project,
      submission: last.id,
    };
    return review.state?.project
      ? t("receipt.line", vars)
      : t("receipt.lineNoProject", vars);
  }

  function showNudge(last) {
    review.$("#receipt-nudge-text").textContent = ta("receipt.nudge");
    review.$("#receipt-line").textContent = review.nudgeLine(last);
  }

  /* The page is often served over plain HTTP on the local network, where the
   clipboard API does not exist; the older copy command still works there. And
   where neither does, the sentence is left selected for the reviewer. */
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const box = document.createElement("textarea");
      box.value = text;
      box.setAttribute("readonly", "");
      box.style.position = "fixed";
      box.style.opacity = "0";
      document.body.append(box);
      box.select();
      let done = false;
      try {
        done = document.execCommand("copy");
      } catch {
        done = false;
      }
      box.remove();
      return done;
    }
  }

  Object.assign(review, {
    showFeedback,
    updateReceipt,
    nudgeLine,
    showNudge,
    copyText,
  });
}

export function bindReceipt(review) {
  /* The batch as far as it has got, under the button that sent it: how many
   marks went, then that the Agent has read them and when, then that its
   understanding has arrived. Handing over used to show only "saved"; the
   reviewer then watched a conversation that said nothing for as long as the
   Agent took to read and think, and could not tell whether anything had
   arrived. The service says each step as it happens, so this only ever
   repeats what it was told. */
  review.clock = (at) =>
    new Intl.DateTimeFormat(currentLocale(), {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(at));

  review.$("#receipt-copy").addEventListener("click", async () => {
    const button = review.$("#receipt-copy");
    if (await review.copyText(review.$("#receipt-line").textContent)) {
      button.textContent = t("receipt.copied");
      clearTimeout(button.timer);
      button.timer = setTimeout(
        () => (button.textContent = t("receipt.copy")),
        2500,
      );
      return;
    }
    getSelection().selectAllChildren(review.$("#receipt-line"));
    review.toast(t("receipt.copyFailed"));
  });
}

export function bindSubmission(review) {
  review.$("#submit-feedback").addEventListener("click", async () => {
    if (review.submitting) return;
    review.submitting = true;
    review.updateButtons();
    review.$("#submit-feedback").textContent = t("feedback.submitting");
    try {
      // The last words typed into a note may still be waiting on the edit lock;
      // pressing this button is what took the focus away from them.
      await review.noteCommit?.catch(() => {});
      await review.flushDraft();
      review.submissionKey ||=
        review.state?.submissions?.findLast(
          (s) =>
            s.versionId === review.loadedId && s.revision === review.revision,
        )?.id || newId();
      const result = await review.api("feedback", {
        ...review.owner(),
        revision: review.revision,
        submissionId: review.submissionKey,
        // The language any line written back to the reviewer is in.
        locale: currentLocale(),
      });
      review.state.draft = {
        ...review.state.draft,
        submittedRevision: review.revision,
      };
      review.state.submissions = [
        ...(review.state.submissions || []).filter((s) => s.id !== result.id),
        result,
      ];
      review.updateReceipt();
      review.toast(t("feedback.submitted"));
    } catch (e) {
      review.showFeedback(e.message);
      review.toast(e.message);
    } finally {
      review.submitting = false;
      review.$("#submit-feedback").innerHTML = review.submitLabel();
      review.updateButtons();
    }
  });
}
