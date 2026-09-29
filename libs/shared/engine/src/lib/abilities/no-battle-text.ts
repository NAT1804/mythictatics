/**
 * Units that fight as their body alone, and why. Everything else has an entry in the realm files.
 *
 * - 'none': the card has no rules text.
 * - 'shop': its text acts between battles — Deploy, selling, End Turn, the Sanctum, Alchemy,
 *   Income — which V1 has no phase for. The economy is where the game is freest to be redesigned
 *   (see docs/game-v1-plan.md, section 5), so these wait for it rather than being approximated.
 * - 'hand': its text reads or fills the hand, which a battle does not have.
 */
export type NoBattleTextReason = 'none' | 'shop' | 'hand';

export const NO_BATTLE_TEXT: Readonly<Record<string, NoBattleTextReason>> = {
  m01002: 'none', // Mummy
  m01003: 'shop', // Hyena Thief
  m01021: 'shop', // Upamaki
  m02005: 'shop', // Narea
  m02007: 'shop', // Hecate
  m02008: 'shop', // Greek Scholar
  m02011: 'shop', // Scylla
  m02014: 'shop', // Charon
  m04001: 'shop', // Lotus Boy
  m04002: 'shop', // Fei Fei
  m04003: 'shop', // Bai Ze
  m04004: 'shop', // Taoist Stork
  m04006: 'shop', // Tudi Gong
  m04008: 'shop', // Taotie
  m04010: 'shop', // Yuetu
  m04011: 'shop', // Hundun
  m04013: 'shop', // Shen Gongbao
  m04016: 'shop', // Zhiji Jing
  m04017: 'shop', // Huang Tianhua
  m04018: 'shop', // Jiang Ziya
  m04019: 'shop', // Xihe
  m04022: 'shop', // Sun Wukong
  m04023: 'shop', // Zhao Gongming
  m04024: 'shop', // Xiao Tianquan
  m05001: 'shop', // Sumerian Scholar
  m05002: 'shop', // Babilonian Soldier
  m05003: 'shop', // Kusarikku
  m05004: 'shop', // Babilonia Archer
  m05005: 'shop', // Uridimmu
  m05006: 'shop', // Ugallu
  m05007: 'shop', // Usumgallu
  m05009: 'shop', // Lamashtu
  m05010: 'shop', // Pazuzu
  m05011: 'shop', // Umu Drabutu
  m05012: 'shop', // Kingu
  m05013: 'shop', // Enkidu
  m05016: 'shop', // Asag
  m05017: 'shop', // Nanna
  m05018: 'shop', // Ashur
  m05019: 'shop', // Enki
  m05020: 'shop', // Ki
  m05021: 'shop', // Ereskigal
  m05022: 'shop', // Ninurta
  m05023: 'shop', // Utu
  m06010: 'shop', // Zakishi Warashi
  m06011: 'shop', // Jimenju
  m07001: 'shop', // Bulgae
  m07002: 'hand', // Chollima
  m07003: 'shop', // Young Ginseng
  m07004: 'shop', // Gumiho
  m07005: 'shop', // Old Ginseng
  m07006: 'shop', // Horangi
  m07007: 'hand', // Samjoko
  m07009: 'shop', // Bulgasari
  m07010: 'shop', // Dokkaebi
  m07011: 'hand', // Inmyeonjo
  m07012: 'hand', // Imugi
  m07013: 'shop', // Yeongdeung Halmang
  m07014: 'shop', // Jowangsin
  m07015: 'hand', // Munsin
  m07016: 'hand', // Sansin
  m07017: 'shop', // Jacheongbi
  m07018: 'shop', // Sonnimne
  m07019: 'shop', // Dalsuni
  m07020: 'shop', // Haesuni
  m07021: 'hand', // Yeomra
  m07022: 'shop', // Cheonjiwang
  m07023: 'hand', // Bari Gongju
  m07024: 'none', // Wraith
  m10002: 'none', // Mercenary
  m10004: 'shop', // Tribal Scout
  m10005: 'shop', // Rosette
  m10006: 'shop', // Sorell
  m10007: 'shop', // Azalea
  m10008: 'shop', // Agonista
  m10010: 'shop', // Salamander
  m10011: 'shop', // Quetz
  m10013: 'shop', // Avidara
  m10015: 'shop', // Chalchiu
  m10018: 'shop', // Vicious Hunter
  m10021: 'shop', // Harmonia
  m10022: 'shop', // Eitri
};
