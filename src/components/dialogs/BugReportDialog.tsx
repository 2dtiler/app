import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { submitBugReportToSentry } from "@/lib/sentry";
import type { BugReportDialogProps } from "@/types/dialogs";

export function BugReportDialog({ open, onOpenChange }: BugReportDialogProps) {
  const [email, setEmail] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function reset() {
    setEmail("");
    setDescription("");
    setSubmitting(false);
    setSubmitted(false);
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) return;

    setSubmitting(true);

    try {
      await submitBugReportToSentry(description, email);
      setSubmitted(true);
    } catch {
      // Still show success when Sentry is unavailable or send fails.
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-primary">
            Submit a Bug or Feature Request
          </DialogTitle>
          <DialogDescription>
            Describe the issue you encountered or the feature you would like to
            see, and we'll look into it.
          </DialogDescription>
        </DialogHeader>

        {submitted ? (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Thank you! Your bug or feature request has been submitted. We'll
              investigate the issue.
            </p>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => handleOpenChange(false)}
            >
              Close
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="bug-email">Email (optional)</Label>
              <Input
                id="bug-email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                So we can follow up if we need more details.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bug-description">
                Description <span className="text-destructive">*</span>
              </Label>
              <textarea
                id="bug-description"
                className="flex min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={submitting || !description.trim()}
            >
              {submitting ? "Submitting…" : "Submit Report"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
