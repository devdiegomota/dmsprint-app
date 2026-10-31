"use client";

/**
 * Nuvem DMS — painel da fila de impressão compartilhada entre celular e PC.
 *
 * No CELULAR: aparece ao tocar "Enviar para a nuvem" na exportação — o PDF sobe
 * e entra na fila como "novo". No PC: abre o mesmo app, digita o código do
 * celular uma vez e baixa/imprime. A lista atualiza em TEMPO REAL (onSnapshot).
 *
 * Fila: novo → impresso → arquivado (+ fixado ⭐ que sobrevive à limpeza).
 * Limpeza: automática (regra de retenção ao abrir o painel) + manual.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Cloud,
  CloudUpload,
  Copy,
  Download,
  ExternalLink,
  FolderOpen,
  Loader2,
  MoreVertical,
  Pin,
  PinOff,
  Printer,
  Search,
  Star,
  Trash2,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { readStoredFlag, useDeviceCode, useNuvemPdfs, useRetentionDays } from "@/hooks/use-nuvem";
import { PRODUCTS } from "@/lib/print/constants";
import { fmtBytes } from "@/lib/print/pdf";
import {
  cleanupNuvemAll,
  cleanupNuvemByAge,
  deleteNuvemPdf,
  nuvemDownloadUrl,
  updateNuvemDoc,
} from "@/lib/nuvem/store";
import { NUVEM_LS, RETENTION_OPTIONS, type NuvemPdfDoc, type NuvemStatus, type RetentionDays } from "@/lib/nuvem/types";

const STATUS_LABEL: Record<NuvemStatus, string> = {
  novo: "Novo",
  impresso: "Impresso",
  arquivado: "Arquivado",
};

const STATUS_CLASS: Record<NuvemStatus, string> = {
  novo: "bg-amber-600 text-white hover:bg-amber-600",
  impresso: "bg-emerald-600 text-white hover:bg-emerald-600",
  arquivado: "bg-muted text-muted-foreground hover:bg-muted",
};

function fmtDate(epochMs: number): string {
  return format(epochMs, "dd MMM yyyy · HH:mm", { locale: ptBR });
}

export function NuvemPanel({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const { code, setCode } = useDeviceCode();
  const { docs, error } = useNuvemPdfs(code);
  const { days, setDays } = useRetentionDays();

  // Filtros
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"todos" | NuvemStatus>("todos");
  const [productFilter, setProductFilter] = useState<"todos" | string>("todos");
  const [periodFilter, setPeriodFilter] = useState<"todos" | "hoje" | "7d" | "30d">("todos");

  // Preferências (lazy: sem setState em effect, sem HTML diferente no SSR)
  const [markOnDownload, setMarkOnDownload] = useState(() => readStoredFlag(NUVEM_LS.markOnDownload));
  const [codeInput, setCodeInput] = useState("");
  const [codeEditing, setCodeEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [cleaning, setCleaning] = useState(false);

  // Limpeza automática: uma vez por código, por sessão do painel.
  const cleanedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!open || !code || !docs) return;
    if (cleanedFor.current === code) return;
    cleanedFor.current = code;
    if (days <= 0 || docs.length === 0) return;
    cleanupNuvemByAge(code, days)
      .then((n) => {
        if (n > 0) toast({ title: `Limpeza automática: ${n} ${n === 1 ? "arte antiga removida" : "artes antigas removidas"}` });
      })
      .catch(() => {
        /* silencioso — a limpeza tenta de novo na próxima abertura */
      });
  }, [open, code, docs, days, toast]);

  const filtered = useMemo(() => {
    if (!docs) return null;
    const term = search.trim().toLowerCase();
    const periodCutoff =
      periodFilter === "hoje"
        ? new Date().setHours(0, 0, 0, 0)
        : periodFilter === "7d"
          ? Date.now() - 7 * 86_400_000
          : periodFilter === "30d"
            ? Date.now() - 30 * 86_400_000
            : 0;
    return docs.filter((d) => {
      if (statusFilter !== "todos" && d.status !== statusFilter) return false;
      if (productFilter !== "todos" && d.product !== productFilter) return false;
      if (periodCutoff && d.createdAt < periodCutoff) return false;
      if (term && !d.name.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [docs, search, statusFilter, productFilter, periodFilter]);

  const novos = docs?.filter((d) => d.status === "novo").length ?? 0;
  const expiraveis = docs?.filter((d) => !d.pinned && (days <= 0 || d.createdAt < Date.now() - days * 86_400_000)) ?? [];

  const handleMarkOnDownload = (v: boolean) => {
    setMarkOnDownload(v);
    window.localStorage.setItem(NUVEM_LS.markOnDownload, v ? "1" : "0");
  };

  const handleDownload = async (d: NuvemPdfDoc) => {
    setBusyId(d.id);
    try {
      const url = await nuvemDownloadUrl(d.storagePath);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${d.name}.pdf`;
      a.target = "_blank"; // iOS Safari não baixa direto — abre a pré-visualização
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      if (markOnDownload && d.status === "novo") {
        await updateNuvemDoc(code!, d.id, { status: "impresso" });
      }
    } catch (err) {
      toast({ title: "Falha ao baixar", description: String((err as Error).message ?? err), variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const handleOpen = async (d: NuvemPdfDoc) => {
    try {
      const url = await nuvemDownloadUrl(d.storagePath);
      window.open(url, "_blank", "noopener");
    } catch (err) {
      toast({ title: "Falha ao abrir", description: String((err as Error).message ?? err), variant: "destructive" });
    }
  };

  const handleStatus = async (d: NuvemPdfDoc, status: NuvemStatus) => {
    setBusyId(d.id);
    try {
      await updateNuvemDoc(code!, d.id, { status });
    } finally {
      setBusyId(null);
    }
  };

  const handlePin = async (d: NuvemPdfDoc) => {
    setBusyId(d.id);
    try {
      await updateNuvemDoc(code!, d.id, { pinned: !d.pinned });
      toast({
        title: d.pinned ? "Arte desafixada" : "Arte fixada ⭐",
        description: d.pinned
          ? "Volta a ser candidata à limpeza por retenção."
          : "Nunca será removida pela limpeza — ideal para clientes recorrentes.",
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (d: NuvemPdfDoc) => {
    setBusyId(d.id);
    try {
      await deleteNuvemPdf(code!, d);
      toast({ title: "PDF excluído", description: `${d.name}.pdf saiu da nuvem.` });
    } catch (err) {
      toast({ title: "Falha ao excluir", description: String((err as Error).message ?? err), variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const handleCleanupAge = async () => {
    setCleaning(true);
    try {
      const n = await cleanupNuvemByAge(code!, days);
      toast({ title: n > 0 ? `${n} ${n === 1 ? "arte antiga removida" : "artes antigas removidas"}` : "Nada a limpar com a regra atual." });
    } catch (err) {
      toast({ title: "Falha na limpeza", description: String((err as Error).message ?? err), variant: "destructive" });
    } finally {
      setCleaning(false);
    }
  };

  const handleCleanupAll = async () => {
    setCleaning(true);
    try {
      const n = await cleanupNuvemAll(code!);
      toast({ title: `${n} ${n === 1 ? "PDF removido" : "PDFs removidos"} (fixados preservados).` });
    } catch (err) {
      toast({ title: "Falha na limpeza", description: String((err as Error).message ?? err), variant: "destructive" });
    } finally {
      setCleaning(false);
    }
  };

  const handleCopyCode = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Não consegui copiar — anote o código manualmente." });
    }
  };

  const handleUseCode = () => {
    if (!codeInput.trim()) return;
    setCode(codeInput);
    cleanedFor.current = null;
    setCodeInput("");
    setCodeEditing(false);
    toast({ title: "Código atualizado", description: "A fila mostrada agora é a do código digitado." });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="border-b p-4">
          <SheetTitle className="flex items-center gap-2">
            <Cloud className="h-5 w-5 text-amber-600" aria-hidden />
            Nuvem DMS
            {novos > 0 && <Badge className={STATUS_CLASS.novo}>{novos} novo{novos > 1 ? "s" : ""}</Badge>}
          </SheetTitle>
          <SheetDescription>
            PDFs gerados no celular aparecem aqui no PC em tempo real — baixe e imprima.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {/* Código do dispositivo */}
          <div className="border-b bg-muted/40 p-4">
            {codeEditing ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor="nuvem-code-input" className="text-sm font-semibold">
                  Digite o código do outro dispositivo
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="nuvem-code-input"
                    value={codeInput}
                    onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                    placeholder="Ex.: DMX7K2"
                    maxLength={6}
                    className="font-mono text-lg tracking-widest uppercase"
                  />
                  <Button onClick={handleUseCode} disabled={codeInput.trim().length !== 6}>
                    Usar
                  </Button>
                  <Button variant="ghost" onClick={() => setCodeEditing(false)}>
                    Cancelar
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  No celular, o código está aqui mesmo — botão de copiar abaixo.
                </p>
                <p className="text-xs text-muted-foreground">
                  Confira letra por letra:{" "}
                  <span className="font-semibold">5/S, 2/Z, 8/B e 6/G</span> se parecem muito.
                </p>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-muted-foreground">Código deste dispositivo</p>
                  <p className="font-mono text-2xl font-bold tracking-widest">{code ?? "···"}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleCopyCode} disabled={!code}>
                    <Copy className="h-4 w-4" aria-hidden />
                    {copied ? "Copiado!" : "Copiar"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setCodeEditing(true)}>
                    <FolderOpen className="h-4 w-4" aria-hidden />
                    Usar outro
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Erro de configuração do backend */}
          {error && (
            <div className="border-b border-amber-600/40 bg-amber-600/10 p-4 text-sm leading-relaxed">
              <p className="font-semibold text-amber-700 dark:text-amber-400">{error}</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
                <li>
                  Console Firebase → <strong>Firestore Database</strong>: o banco precisa existir
                  com o ID exato <strong>(default)</strong> — banco com nome personalizado (ex.:
                  “dmsprint-app”) fica invisível para o app.
                </li>
                <li>Console → <strong>Storage</strong> → Começar.</li>
                <li>Em ambos, aba <strong>Regras</strong>, cole as regras da Nuvem DMS e publique.</li>
              </ol>
            </div>
          )}

          {/* Busca + filtros */}
          <div className="grid gap-2 border-b p-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar pelo nome da arte…"
                aria-label="Buscar PDFs pelo nome"
                className="pl-9"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
                <SelectTrigger aria-label="Filtrar por status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Status: todos</SelectItem>
                  <SelectItem value="novo">Novos</SelectItem>
                  <SelectItem value="impresso">Impressos</SelectItem>
                  <SelectItem value="arquivado">Arquivados</SelectItem>
                </SelectContent>
              </Select>
              <Select value={productFilter} onValueChange={setProductFilter}>
                <SelectTrigger aria-label="Filtrar por produto"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Produto: todos</SelectItem>
                  {Object.values(PRODUCTS).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={periodFilter} onValueChange={(v) => setPeriodFilter(v as typeof periodFilter)}>
                <SelectTrigger aria-label="Filtrar por período"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Período: tudo</SelectItem>
                  <SelectItem value="hoje">Hoje</SelectItem>
                  <SelectItem value="7d">7 dias</SelectItem>
                  <SelectItem value="30d">30 dias</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Fila */}
          <div className="flex flex-col gap-3 p-4">
            {!filtered && !error && (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Carregando a fila…
              </div>
            )}

            {filtered && filtered.length === 0 && !error && (
              <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
                <CloudUpload className="h-8 w-8 opacity-40" aria-hidden />
                {docs && docs.length > 0 ? (
                  "Nenhum PDF com esses filtros."
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <p>
                      Nenhum PDF na nuvem ainda. No celular, toque em “Enviar para a nuvem” na
                      etapa 5.
                    </p>
                    <p className="max-w-xs text-xs">
                      Enviou do celular e não aparece? Confira se o código acima é o do celular —
                      letra por letra (5/S, 2/Z, 8/B, 6/G).
                    </p>
                  </div>
                )}
              </div>
            )}

            {filtered?.map((d) => (
              <div key={d.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate font-medium">
                      {d.pinned && <Star className="h-3.5 w-3.5 shrink-0 fill-amber-500 text-amber-500" aria-label="Fixado" />}
                      <span className="truncate">{d.name}.pdf</span>
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {d.productName} · {fmtDate(d.createdAt)} · {fmtBytes(d.sizeBytes)}
                    </p>
                  </div>
                  <Badge className={STATUS_CLASS[d.status]}>{STATUS_LABEL[d.status]}</Badge>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => handleDownload(d)}
                    disabled={busyId === d.id}
                    className="flex-1 bg-amber-600 hover:bg-amber-700"
                  >
                    {busyId === d.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Download className="h-4 w-4" aria-hidden />
                    )}
                    Baixar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleOpen(d)}>
                    <ExternalLink className="h-4 w-4" aria-hidden />
                    <span className="hidden sm:inline">Abrir</span>
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="ghost" aria-label={`Mais ações para ${d.name}`}>
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleOpen(d)}>
                        <ExternalLink className="h-4 w-4" aria-hidden />
                        Abrir em nova aba
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {d.status !== "novo" && (
                        <DropdownMenuItem onClick={() => handleStatus(d, "novo")}>
                          <Undo2 className="h-4 w-4" aria-hidden />
                          Voltar para novo
                        </DropdownMenuItem>
                      )}
                      {d.status !== "impresso" && (
                        <DropdownMenuItem onClick={() => handleStatus(d, "impresso")}>
                          <Printer className="h-4 w-4" aria-hidden />
                          Marcar como impresso
                        </DropdownMenuItem>
                      )}
                      {d.status !== "arquivado" && (
                        <DropdownMenuItem onClick={() => handleStatus(d, "arquivado")}>
                          <FolderOpen className="h-4 w-4" aria-hidden />
                          Arquivar
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => handlePin(d)}>
                        {d.pinned ? <PinOff className="h-4 w-4" aria-hidden /> : <Pin className="h-4 w-4" aria-hidden />}
                        {d.pinned ? "Desafixar (volta a expirar)" : "Fixar (nunca expira)"}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <DropdownMenuItem
                            variant="destructive"
                            onSelect={(e) => e.preventDefault()}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                            Excluir
                          </DropdownMenuItem>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir da nuvem?</AlertDialogTitle>
                            <AlertDialogDescription>
                              {d.name}.pdf será removido do Storage e da fila. O arquivo já baixado no
                              dispositivo não é afetado.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-white hover:bg-destructive/90"
                              onClick={() => handleDelete(d)}
                            >
                              Excluir
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Limpeza */}
        <div className="border-t bg-muted/40 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <Label htmlFor="nuvem-retention" className="text-sm font-semibold">
                Limpeza automática
              </Label>
              <p className="text-xs text-muted-foreground">
                Remove artes não fixadas mais antigas que o período (roda ao abrir este painel).
              </p>
            </div>
            <Select value={String(days)} onValueChange={(v) => setDays(Number(v) as RetentionDays)}>
              <SelectTrigger id="nuvem-retention" className="w-32" aria-label="Período de retenção">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RETENTION_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={String(opt)}>
                    {opt === 0 ? "Nunca" : `${opt} dias`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" disabled={cleaning || expiraveis.length === 0 || days <= 0}>
                  {cleaning ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />}
                  Limpar antigas ({expiraveis.length})
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Limpar artes antigas?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {expiraveis.length} {expiraveis.length === 1 ? "arte não fixada será removida" : "artes não fixadas serão removidas"} agora
                    pela regra de {days} dias. As fixadas ⭐ e os arquivos já baixados não são afetados.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleCleanupAge}>Limpar agora</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" disabled={cleaning || (docs?.length ?? 0) === 0}>
                  Excluir todas
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir TODAS as artes?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Todos os PDFs não fixados saem da nuvem ({docs?.filter((d) => !d.pinned).length ?? 0} no total).
                    As fixadas ⭐ são preservadas. Não dá para desfazer.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-white hover:bg-destructive/90"
                    onClick={handleCleanupAll}
                  >
                    Excluir todas
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          <Separator className="my-3" />
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="nuvem-mark-download" className="text-xs text-muted-foreground">
              Marcar como impresso ao baixar
            </Label>
            <Switch id="nuvem-mark-download" checked={markOnDownload} onCheckedChange={handleMarkOnDownload} />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
