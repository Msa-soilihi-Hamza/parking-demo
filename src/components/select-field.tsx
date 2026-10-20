"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Option = { value: string; label: string };

type Props = {
  id: string;
  /** Submitted with the form through a hidden input. */
  name: string;
  value: string;
  onValueChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
};

/** shadcn Select that posts its value in a regular <form>. */
export function SelectField({ id, name, value, onValueChange, options, placeholder }: Props) {
  return (
    <>
      <input type="hidden" name={name} value={value} />
      <Select
        items={options}
        value={value || null}
        onValueChange={(next) => onValueChange(next ? String(next) : "")}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}
