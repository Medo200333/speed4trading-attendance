import { useState, useEffect } from "react";
import type { Confirmation, ActionInput } from "@/lib/access/contracts";
import { useCenter, Button, Field, Modal } from "./access-ui";
type Operation = Extract<ActionInput, { action: "prepare" }>["operation"];
export function useInlineOperation(
  key: string,
  onVerified?: () => Promise<void> | void,
) {
  const { run, busy, setWorkPending } = useCenter();
  const [confirmation, setConfirmation] = useState<Confirmation>(),
    [phrase, setPhrase] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  useEffect(() => {
    setWorkPending(key, Boolean(confirmation));
    return () => setWorkPending(key, false);
  }, [Boolean(confirmation)]);
  async function prepare(operation: Operation) {
    setError("");
    setNotice("");
    const result = await run(
      { action: "prepare", operation },
      { inline: true, onError: setError },
    );
    if (result?.confirmation) {
      setConfirmation(result.confirmation);
      setPhrase("");
    }
  }
  const dialog = confirmation ? (
    <Modal
      title={confirmation.title}
      busy={busy}
      onClose={() => setConfirmation(undefined)}
    >
      <p>{confirmation.description}</p>
      {confirmation.warnings.map((text, i) => (
        <p key={i} className="ac-message warning">
          {text}
        </p>
      ))}
      {error && (
        <p role="alert" className="ac-message error">
          {error}
        </p>
      )}
      <Field
        label={`اكتب: ${confirmation.phrase}`}
        value={phrase}
        onChange={(e) => setPhrase(e.target.value)}
        autoComplete="off"
      />
      <div className="ac-actions">
        <Button
          primary
          disabled={busy || phrase.trim() !== confirmation.phrase}
          onClick={async () => {
            const result = await run(
              { action: "commit", token: confirmation.token, phrase },
              { inline: true, onError: setError },
            );
            if (result) {
              setNotice(result.notice || "اكتملت العملية المؤكدة.");
              setConfirmation(undefined);
              await onVerified?.();
            }
          }}
        >
          تأكيد وإرسال إلى الجهاز
        </Button>
        <Button disabled={busy} onClick={() => setConfirmation(undefined)}>
          إلغاء دون إرسال
        </Button>
      </div>
    </Modal>
  ) : null;
  return {
    prepare,
    dialog,
    message: (
      <>
        {error && !confirmation && (
          <p role="alert" className="ac-message error">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="ac-message success">
            {notice}
          </p>
        )}
      </>
    ),
  };
}
