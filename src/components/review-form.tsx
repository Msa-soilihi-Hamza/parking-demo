"use client";

import { Loader2Icon, StarIcon } from "lucide-react";
import { useActionState, useState } from "react";
import { submitReviewAction, type ReviewFormState } from "@/app/(site)/reservation/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const LABELS = ["", "Très déçu", "Déçu", "Correct", "Bien", "Parfait"];
const MAX_LENGTH = 500;

export function ReviewForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<ReviewFormState, FormData>(submitReviewAction, {});
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [consent, setConsent] = useState(true);
  const shown = hover || rating;

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="rating" value={rating} />
      {consent && <input type="hidden" name="publishConsent" value="on" />}

      <div>
        <div className="flex gap-1" role="radiogroup" aria-label="Votre note" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n} étoile${n > 1 ? "s" : ""}`}
              onClick={() => setRating(n)}
              onMouseEnter={() => setHover(n)}
              className="rounded-md p-1 transition hover:scale-110"
            >
              <StarIcon
                className={cn("size-9", n <= shown ? "fill-primary text-primary" : "text-muted-foreground/30")}
              />
            </button>
          ))}
        </div>
        <p className="mt-1 h-5 text-sm text-muted-foreground">{LABELS[shown]}</p>
      </div>

      <Field>
        <FieldLabel htmlFor="comment">
          Un mot sur votre retour <span className="font-normal text-muted-foreground">(facultatif)</span>
        </FieldLabel>
        <Textarea
          id="comment"
          name="comment"
          rows={3}
          maxLength={MAX_LENGTH}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="La navette, l'attente, l'accueil…"
        />
        <p className="text-right text-xs text-muted-foreground tabular-nums">
          {comment.length}/{MAX_LENGTH}
        </p>
      </Field>

      <label className="flex items-start gap-3 text-sm">
        <Checkbox checked={consent} onCheckedChange={(checked) => setConsent(checked === true)} className="mt-0.5" />
        <span>
          J&apos;accepte que mon avis soit publié sur le site, avec mon prénom et l&apos;initiale de mon nom.
        </span>
      </label>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}

      <Button type="submit" size="lg" disabled={pending || rating === 0} className="w-full">
        {pending && <Loader2Icon className="animate-spin" />}
        Envoyer mon avis
      </Button>
    </form>
  );
}
