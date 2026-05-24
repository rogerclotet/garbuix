import { Loader2Icon, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { DailyPuzzlePublic } from "@/lib/puzzle-types";
import { renderProgressCanvas } from "./share-progress";

type SharePreviewDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	puzzle: DailyPuzzlePublic;
	revealedCells: Set<string>;
	guessedCount: number;
	totalWords: number;
	onConfirm: () => void;
};

export function SharePreviewDialog({
	open,
	onOpenChange,
	puzzle,
	revealedCells,
	guessedCount,
	totalWords,
	onConfirm,
}: SharePreviewDialogProps) {
	const [previewUrl, setPreviewUrl] = useState<string | null>(null);

	useEffect(() => {
		if (!open) {
			setPreviewUrl(null);
			return;
		}

		let cancelled = false;
		let objectUrl: string | null = null;

		try {
			const canvas = renderProgressCanvas(
				puzzle,
				revealedCells,
				guessedCount,
				totalWords,
			);
			canvas.toBlob((blob) => {
				if (cancelled || !blob) return;
				objectUrl = URL.createObjectURL(blob);
				setPreviewUrl(objectUrl);
			}, "image/png");
		} catch {
			setPreviewUrl(null);
		}

		return () => {
			cancelled = true;
			if (objectUrl) URL.revokeObjectURL(objectUrl);
		};
	}, [open, puzzle, revealedCells, guessedCount, totalWords]);

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent className="data-[size=default]:max-w-sm data-[size=default]:sm:max-w-md">
				<AlertDialogHeader>
					<AlertDialogTitle className="text-base">
						Compartir el teu progrés
					</AlertDialogTitle>
					<AlertDialogDescription>
						La imatge mostra quines caselles has revelat, però amaga les
						lletres. Així pots presumir del progrés sense fer espòilers a qui
						encara no ha jugat.
					</AlertDialogDescription>
				</AlertDialogHeader>

				<div className="bg-muted/40 flex items-center justify-center overflow-hidden rounded-lg border border-border/60 p-3">
					{previewUrl ? (
						<img
							src={previewUrl}
							alt="Vista prèvia de la imatge a compartir"
							className="max-h-72 w-auto rounded-md"
						/>
					) : (
						<div className="flex h-40 items-center justify-center text-muted-foreground">
							<Loader2Icon className="size-5 animate-spin" />
						</div>
					)}
				</div>

				<AlertDialogFooter>
					<AlertDialogCancel>Cancel·lar</AlertDialogCancel>
					<AlertDialogAction
						onClick={() => {
							onConfirm();
						}}
					>
						<Share2 className="size-4" />
						Compartir
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
