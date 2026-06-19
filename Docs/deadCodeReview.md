# Dead Code Review

## Status (2026-06-08)

| Metric           | Count |
| ---------------- | ----- |
| Open             | 8     |
| Fixed since last | —     |
| New              | 8     |

---

## 2026-06-08

### New findings

- `desktop/src/components/ui/badge.tsx` — `Badge`, `badgeVariants` exported but never imported by any other file (shadcn/ui component, possibly intended for future use)
- `desktop/src/components/ui/popover.tsx` — `Popover`, `PopoverTrigger`, `PopoverContent` exported but never imported elsewhere
- `desktop/src/components/ui/dropdown-menu.tsx` — all 17 exports never imported by any other file
- `desktop/src/components/ui/tabs.tsx` — `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` exported but never imported elsewhere
- `desktop/src/components/ui/collapsible.tsx` — `Collapsible`, `CollapsibleTrigger`, `CollapsibleContent` exported but never imported elsewhere
- `desktop/src/components/ui/card.tsx` — `Card`, `CardHeader`, `CardFooter`, `CardTitle`, `CardDescription`, `CardContent` exported but never imported elsewhere
- `desktop/src/components/ui/native-select.tsx` — `NativeSelect` exported but never imported elsewhere
- `scripts/pre_build.py:177` — dead function `download_diarize()` defined but never called from `main()` or anywhere else
