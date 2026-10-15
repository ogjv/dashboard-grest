import type { DreImportData } from "../types";

const normalize = (label: string) => label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
const fiscalName = /\b(COFINS|CSLL|ICMS|IRPJ|PIS|ISS|ISSQN)\b|\bSIMPLES\s+NACIONAL\b/;
const genericTaxName = /\b(IMPOSTOS?|TRIBUTOS?)\b/;
const payrollName = /\b(CMO|PESSOAL|FOLHA|SALARIOS?|ENCARGOS|FGTS|GPS|INSS)\b|\bMAO\s+DE\s+OBRA\b/;
const isFiscal = (label: string) => fiscalName.test(normalize(label)) || /^(?:GUIA\s+)?DAS$/.test(normalize(label).trim());
const isTaxGroup = (label: string) => genericTaxName.test(normalize(label)) || isFiscal(label);
// A mixed fee-and-tax line does not disclose the tax amount. Do not classify
// its entire value as tax unless a specific fiscal name is present.
const isTaxLine = (label: string) => isFiscal(label) || (genericTaxName.test(normalize(label)) && !/\bTAXAS?\b/.test(normalize(label)));

/** Read named tax groups or individual fiscal lines in mixed groups.
 * Group totals and their children are never counted together. Payroll charges
 * remain in CMO; a sales-deduction total is not itself a tax total. */
export function getDreTaxValue(data: DreImportData): number {
  return data.sections.reduce((sectionSum, section) => {
    if (payrollName.test(normalize(section.label))) return sectionSum;
    return sectionSum + section.groups.reduce((groupSum, group) => {
      if (payrollName.test(normalize(group.label))) return groupSum;
      const lines = group.lines.filter(line => !payrollName.test(normalize(line.label)));
      if (isTaxGroup(group.label)) {
        if (group.total && lines.length === group.lines.length) return groupSum + group.total.value;
        return groupSum + lines.reduce((sum, line) => sum + line.value, 0);
      }
      return groupSum + lines.filter(line => isTaxLine(line.label)).reduce((sum, line) => sum + line.value, 0);
    }, 0);
  }, 0);
}
