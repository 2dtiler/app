import { useState } from "react";
import * as Sentry from "@sentry/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface BugReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

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
      Sentry.setUser({ email: email.trim() || undefined });

      Sentry.captureEvent({
        message: `Bug Report: ${description.slice(0, 80)}`,
        level: "error",
        tags: { source: "bug-report-dialog" },
        extra: {
          description,
          reporterEmail: email.trim() || "not provided",
        },
        user: {
          email: email.trim() || undefined,
        },
      });

      // Flush to ensure the event is sent before we show success
      await Sentry.flush(3000);
      setSubmitted(true);
    } catch {
      // Still show success — Sentry may buffer the event
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-primary">Submit a Bug Report</DialogTitle>
          <DialogDescription>
            Describe the issue you encountered and we'll look into it.
          </DialogDescription>
        </DialogHeader>

        {submitted ? (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Thank you! Your bug report has been submitted. We'll investigate
              the issue.
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
                placeholder="What happened? What did you expect to happen?"
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
