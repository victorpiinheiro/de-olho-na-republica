"use client";

import { useState } from "react";
import { Barra } from "@/components/Barra";
import { Kpi } from "@/components/Kpi";
import {
  arvoreEstadual,
  arvoreFederal,
  categoriasEstadual,
  type DetalheEstadualDados,
  type DetalheFederalDados,
  type ItemCategoria,
  type NoEstadual,
  type NoFederal,
} from "@/lib/detalhe";
import { brlGrande, MESES_COMPLETOS, pct, pctFatia } from "@/lib/format";
import { mesesDoPeriodo, type Granularidade } from "@/lib/oficial";

// As listas expansíveis reaproveitam as classes "orc-*" da tela de Orçamento (mesmo desenho).

const GRAN: Record<Granularidade, string> = { mes: "Mês", bimestre: "Bimestre", acumulado: "Acumulado no ano" };
const sinal = (n: number) => `${n >= 0 ? "+" : "−"}${pct(Math.abs(n))}`;
const intervalo = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

function Linha({ nome, texto, valor, total, nota, filhos }: { nome: string; texto: string; valor: number; total: number; nota?: string; filhos?: React.ReactNode }) {
  const cabeca = (
    <>
      <span className="orc-nome">{nome}</span>
      <span className="orc-valor">{texto}</span>
      <span className="orc-barra"><Barra valor={valor} maximo={total} /></span>
    </>
  );
  if (!filhos && !nota) return <li><div className="orc-funcao det-folha">{cabeca}</div></li>;
  return (
    <li>
      <details className="orc-funcao">
        <summary>{cabeca}</summary>
        <div className="orc-detalhe">
          {nota && <p className="orc-nota">{nota}</p>}
          {filhos}
        </div>
      </details>
    </li>
  );
}

function ListaFederal({ nos, total }: { nos: NoFederal[]; total: number }) {
  return (
    <ul className="orc-lista">
      {nos.map((n) => {
        const variacao = n.anterior && n.anterior > 0 ? ` · ${sinal(((n.valor - n.anterior) / n.anterior) * 100)}` : "";
        return (
          <Linha
            key={n.codigo}
            nome={n.nome}
            texto={`${brlGrande(n.valor)} · ${pctFatia(n.valor, total)}${variacao}`}
            valor={n.valor}
            total={total}
            filhos={n.filhos.length > 0 ? <ListaFederal nos={n.filhos} total={total} /> : undefined}
          />
        );
      })}
    </ul>
  );
}

export function PorCategoria({ itens, titulo, nota }: { itens: ItemCategoria[]; titulo: string; nota: string }) {
  const total = itens.reduce((s, i) => s + i.valor, 0);
  return (
    <section className="card" aria-label={titulo}>
      <h2>{titulo}</h2>
      <p className="nota-grafico">{nota}</p>
      <ul className="tributos">
        {[...itens].sort((a, b) => b.valor - a.valor).map((i) => (
          <li key={i.categoria}>
            <div className="tributos-topo">
              <span>{i.categoria}</span>
              <span>{pctFatia(i.valor, total)} · {brlGrande(i.valor)}</span>
            </div>
            <Barra valor={i.valor} maximo={total} />
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------- Federal (mensal, Receita)

export function DetalheFederal({ d }: { d: DetalheFederalDados }) {
  const anos = [...new Set(d.valores.map((v) => v[0]))].sort((a, b) => b - a);
  const [ano, setAno] = useState(d.ano);
  const [gran, setGran] = useState<Granularidade>("acumulado");
  const [escolhido, setEscolhido] = useState<number | null>(null);

  const ultimo = ano === d.ano ? d.ultimoMes : 12;
  const unidade = gran === "bimestre" ? 2 : 1;
  const periodos = gran === "acumulado" ? [] : intervalo(1, 12 / unidade);
  const valido = (n: number) => n * unidade <= ultimo; // o recorte só vale com todos os meses publicados
  const ultimoValido = Math.max(1, Math.floor(ultimo / unidade));
  const periodo = escolhido !== null && valido(escolhido) ? escolhido : ultimoValido;
  const meses = mesesDoPeriodo(gran, periodo, ultimo);

  const arv = arvoreFederal(d, ano, meses);
  const variacao = arv.totalAnterior && arv.totalAnterior > 0 ? ((arv.total - arv.totalAnterior) / arv.totalAnterior) * 100 : null;
  const primeiro = MESES_COMPLETOS[meses[0] - 1];
  const fim = MESES_COMPLETOS[meses[meses.length - 1] - 1];
  const titulo =
    gran === "mes" ? `${primeiro} de ${ano}` : gran === "bimestre" ? `${periodo}º bimestre de ${ano} (${primeiro.toLowerCase()}–${fim.toLowerCase()})` : `${primeiro} a ${fim} de ${ano}`;

  const base = d.base.filter((b) => b.ano === ano);
  const baseAteMes = base[0]?.ateMes ?? 12;

  return (
    <div className="det-pilha">
      <section className="card" aria-labelledby="titulo-det-fed">
        <div className="projecao-topo">
          <h2 id="titulo-det-fed">Federal por tributo</h2>
          <span className="selo-oficial">Publicado pela fonte · valor bruto</span>
        </div>
        <p className="projecao-aviso">
          Receitas administradas pela Receita Federal, abertas por tributo. Fonte: Receita Federal, “Análise da Arrecadação das
          Receitas Federais”, Tabela I. Clique num tributo para ver as partes.
        </p>

        <div className="oficial-controles">
          <div className="alternancia" role="group" aria-label="Ano">
            {anos.map((a) => (
              <button key={a} type="button" className={`aba${a === ano ? " aba-ativa" : ""}`} aria-pressed={a === ano} onClick={() => { setAno(a); setEscolhido(null); }}>
                {a}
              </button>
            ))}
          </div>
          <div className="alternancia" role="group" aria-label="Recorte">
            {(["mes", "bimestre", "acumulado"] as const).map((g) => (
              <button key={g} type="button" className={`aba${gran === g ? " aba-ativa" : ""}`} aria-pressed={gran === g} onClick={() => { setGran(g); setEscolhido(null); }}>
                {GRAN[g]}
              </button>
            ))}
          </div>
          {periodos.length > 0 && (
            <div className="filtro-ufs-lista" role="group" aria-label="Período">
              {periodos.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`aba${n === periodo ? " aba-ativa" : ""}${valido(n) ? "" : " aba-off"}`}
                  aria-pressed={n === periodo}
                  disabled={!valido(n)}
                  title={valido(n) ? undefined : "Ainda não publicado"}
                  onClick={() => setEscolhido(n)}
                >
                  {gran === "mes" ? MESES_COMPLETOS[n - 1].slice(0, 3) : `${n}º bim.`}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="kpis kpis-3">
          <Kpi rotulo={`Arrecadado · ${titulo}`} valor={brlGrande(arv.total)} nota="inclui a receita previdenciária" />
          {variacao !== null && arv.totalAnterior !== null && (
            <Kpi rotulo={`Nominal vs. mesmo período de ${ano - 1}`} valor={sinal(variacao)} nota={`${brlGrande(arv.totalAnterior)} em ${ano - 1}`} />
          )}
        </div>

        <ListaFederal nos={arv.nos} total={arv.total} />
        <p className="nota-grafico">
          Percentual sobre o total do período{variacao !== null ? "; a variação ao lado é a nominal sobre o mesmo período do ano anterior" : ""}.
          Valores em reais correntes. “IPI” inclui o IPI vinculado à importação. Não inclui receitas administradas por outros órgãos.
        </p>
      </section>

      {base.length > 0 && (
        <PorCategoria
          titulo="Federal por base de incidência"
          nota={`${ano}, ${baseAteMes === 12 ? "ano completo" : `janeiro a ${MESES_COMPLETOS[baseAteMes - 1].toLowerCase()}`}. Classificação oficial da Receita Federal (Tabela VII): renda e propriedade, folha de salários, bens e serviços, transações financeiras e outros.`}
          itens={base.map((b) => ({ categoria: b.categoria, valor: b.valor }))}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Estadual (anual, bruto, DCA)

const reais = brlGrande;

function ListaEstadual({ nos, total }: { nos: NoEstadual[]; total: number }) {
  return (
    <ul className="orc-lista">
      {nos.map((n) => {
        const deducoes = n.fundeb + n.transferencias + n.outras;
        const nota =
          deducoes > 0
            ? `Bruto ${reais(n.bruto)} − deduções ${reais(deducoes)} (FUNDEB ${reais(n.fundeb)}, repasses constitucionais a municípios ${reais(n.transferencias)}, outras ${reais(n.outras)}) = líquido ${reais(n.liquido)}.`
            : undefined;
        return (
          <Linha
            key={n.cod}
            nome={n.nome}
            texto={`${reais(n.bruto)} · ${pctFatia(n.bruto, total)}`}
            valor={n.bruto}
            total={total}
            nota={nota}
            filhos={n.filhos.length > 0 ? <ListaEstadual nos={n.filhos} total={total} /> : undefined}
          />
        );
      })}
    </ul>
  );
}

export function DetalheEstadual({ d, ufs }: { d: DetalheEstadualDados; ufs: ReadonlySet<string> | null }) {
  const [ano, setAno] = useState(d.anos[0]);
  const arv = arvoreEstadual(d, ano, ufs);
  const categorias = categoriasEstadual(d, ano, ufs);
  const escopo = ufs ? `${ufs.size} estado${ufs.size > 1 ? "s" : ""} selecionado${ufs.size > 1 ? "s" : ""}` : "27 estados (26 + DF)";

  return (
    <div className="det-pilha">
      <section className="card" aria-labelledby="titulo-det-est">
        <div className="projecao-topo">
          <h2 id="titulo-det-est">Estadual por imposto · anual</h2>
          <span className="selo-oficial">Publicado pela fonte · valor bruto</span>
        </div>
        <p className="projecao-aviso">
          Receita tributária de {escopo} em {ano}, <strong>bruta</strong>: ICMS, IPVA, ITCMD, IR retido e taxas. Fonte: Tesouro
          Nacional, Declaração de Contas Anuais (DCA, Anexo I-C), que é anual — a de {d.anos[0] + 1} só sai por volta de abril de{" "}
          {d.anos[0] + 2}. Clique num item para ver as deduções.
        </p>

        {d.anos.length > 1 && (
          <div className="alternancia" role="group" aria-label="Ano">
            {d.anos.map((a) => (
              <button key={a} type="button" className={`aba${a === ano ? " aba-ativa" : ""}`} aria-pressed={a === ano} onClick={() => setAno(a)}>
                {a}
              </button>
            ))}
          </div>
        )}

        <div className="kpis kpis-3">
          <Kpi rotulo={`Receita bruta · ${ano}`} valor={reais(arv.bruto)} nota="impostos e taxas, antes das deduções" />
          <Kpi rotulo="Deduções" valor={reais(arv.deducoes)} nota="repasses a municípios, FUNDEB e outras" />
          <Kpi rotulo="Líquido" valor={reais(arv.liquido)} nota="o que fica com o estado; é o que o RREO mostra no bloco “Dados oficiais”" />
        </div>

        <ListaEstadual nos={arv.nos} total={arv.bruto} />
        <p className="nota-grafico">
          Percentual sobre o total bruto. Parte da arrecadação é repassada por lei aos municípios (como parte do ICMS e do
          IPVA) e ao FUNDEB. O RREO, usado no bloco “Dados oficiais”, mostra o valor líquido dessas deduções, e cada estado as
          contabiliza de um jeito. No Distrito Federal aparecem também IPTU e ISS.
        </p>
      </section>

      {categorias.length > 0 && (
        <PorCategoria
          titulo="Estadual por base de incidência"
          nota={`${ano}, valor bruto. Mesma classificação da Receita Federal: IPVA, ITCMD e IR retido em renda e propriedade; ICMS em bens e serviços; taxas em outros.`}
          itens={categorias}
        />
      )}
    </div>
  );
}
