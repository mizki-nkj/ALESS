#!/usr/bin/env python3
"""Generate manuscript Figures 2-8 and Supplementary Figures S1-S6.

Input:
  New_Summer_Vegetation_Statistics_All_Phases.csv

Main analysis definitions:
  Pre: 2003-2010; transition year: 2011; post: 2012-2025.
  Treatment: Inside_Difficult_Return_Zone.
  Control: Outside_Difficult_Return_Zone.
  DID inference: OLS on annual Inside-Outside gaps with Newey-West HAC SE (lag 2).
  Pre-trend inference: OLS on pre-period annual gaps with HAC SE (lag 1).
  Event-study coefficient: annual gap minus the 2010 gap.
"""
from pathlib import Path
import argparse
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D
import statsmodels.api as sm
from scipy import stats

INSIDE = "Inside_Difficult_Return_Zone"
OUTSIDE = "Outside_Difficult_Return_Zone"
LANDS = ["Paddy", "Cropland", "Forest", "Grassland", "Urban"]
OUTCOMES = ["NDVI_mean", "NDMI_mean", "EVI_mean", "NBR_mean"]
SHORT = {"NDVI_mean":"NDVI", "NDMI_mean":"NDMI", "EVI_mean":"EVI", "NBR_mean":"NBR"}
PRE = list(range(2003, 2011)); POST = list(range(2012, 2026)); BASE = 2010
COLORS = {INSIDE:"#D55E00", OUTSIDE:"#0072B2"}
LAND_COLORS = {"Paddy":"#0072B2", "Cropland":"#E69F00", "Forest":"#009E73", "Grassland":"#56B4E9", "Urban":"#CC79A7"}


def save(fig, outdir, stem):
    fig.savefig(outdir/f"{stem}.png", dpi=300, bbox_inches="tight")
    fig.savefig(outdir/f"{stem}.pdf", bbox_inches="tight")
    plt.close(fig)


def hac_fit(x, y, lag):
    return sm.OLS(y, x).fit(cov_type="HAC", cov_kwds={"maxlags":lag, "use_correction":True}, use_t=True)


def gaps_from_df(df):
    rec=[]
    for (year, land), g in df.groupby(["Year","Land_Class"]):
        z=g.set_index("Zone")
        r={"Year":int(year),"Land_Class":land,
           "Inside_Valid_Area_Ratio":float(z.loc[INSIDE,"Valid_Area_Ratio"]),
           "Outside_Valid_Area_Ratio":float(z.loc[OUTSIDE,"Valid_Area_Ratio"])}
        for o in OUTCOMES:
            r[o+"_Gap"]=float(z.loc[INSIDE,o]-z.loc[OUTSIDE,o])
        rec.append(r)
    return pd.DataFrame(rec).sort_values(["Land_Class","Year"])


def main_did(gaps):
    rows=[]
    for land in LANDS:
        d=gaps[(gaps.Land_Class==land)&gaps.Year.isin(PRE+POST)].copy()
        d["Post"]=d.Year.isin(POST).astype(int)
        for o in OUTCOMES:
            m=hac_fit(sm.add_constant(d[["Post"]].astype(float)), d[o+"_Gap"], 2)
            b,se,p=m.params.Post,m.bse.Post,m.pvalues.Post
            crit=stats.t.ppf(.975,m.df_resid)
            rows.append([land,SHORT[o],b,b-crit*se,b+crit*se,p])
    return pd.DataFrame(rows,columns=["Land_Class","Outcome","Effect","Lower","Upper","P_Value"])


def event_data(gaps):
    rows=[]
    for land in LANDS:
        d=gaps[gaps.Land_Class==land].set_index("Year")
        for o in OUTCOMES:
            base=d.loc[BASE,o+"_Gap"]
            for year in d.index:
                rows.append([land,SHORT[o],int(year),int(year-2011),float(d.loc[year,o+"_Gap"]-base)])
    ev=pd.DataFrame(rows,columns=["Land_Class","Outcome","Year","Event_Time","Coefficient"])
    p=(ev.groupby(["Outcome","Year","Event_Time"])["Coefficient"]
       .agg(Coefficient="mean",SD="std",N="count").reset_index())
    p["SE"]=p.SD/np.sqrt(p.N)
    crit=stats.t.ppf(.975,p.N-1)
    p["Lower"]=p.Coefficient-crit*p.SE; p["Upper"]=p.Coefficient+crit*p.SE
    return ev,p


def sensitivity(gaps):
    specs=[("Main",[],None),("Exclude 2003",[2003],None),("Exclude 2005",[2005],None),
           ("Exclude 2016",[2016],None),("Exclude 2003, 2005, 2016",[2003,2005,2016],None),
           ("Valid area ratio ≥ 0.70",[],.70),("Valid area ratio ≥ 0.80",[],.80),
           ("Valid area ratio ≥ 0.90",[],.90)]
    rows=[]
    for spec,excl,thr in specs:
        for land in LANDS:
            d=gaps[(gaps.Land_Class==land)&gaps.Year.isin(PRE+POST)&~gaps.Year.isin(excl)].copy()
            if thr is not None:
                d=d[(d.Inside_Valid_Area_Ratio>=thr)&(d.Outside_Valid_Area_Ratio>=thr)]
            d["Post"]=d.Year.isin(POST).astype(int)
            if d.Post.nunique()<2: continue
            for o in OUTCOMES:
                m=hac_fit(sm.add_constant(d[["Post"]].astype(float)),d[o+"_Gap"],2)
                b,se=m.params.Post,m.bse.Post; crit=stats.t.ppf(.975,m.df_resid)
                rows.append([spec,land,SHORT[o],b,b-crit*se,b+crit*se])
    return pd.DataFrame(rows,columns=["Specification","Land_Class","Outcome","Effect","Lower","Upper"])


def add_periods(ax):
    ax.axvspan(2002.5,2010.5,color="0.92",zorder=0)
    ax.axvspan(2010.5,2011.5,color="#FDEBD0",alpha=.8,zorder=0)
    ax.axvline(2011,color="0.35",ls="--",lw=1)


def figure2(df,outdir):
    fig,axes=plt.subplots(5,2,figsize=(12,15),sharex=True)
    for i,land in enumerate(LANDS):
        for j,(metric,label) in enumerate([("NDVI_mean","NDVI"),("NDMI_mean","NDMI")]):
            ax=axes[i,j]; add_periods(ax)
            for zone in [INSIDE,OUTSIDE]:
                d=df[(df.Land_Class==land)&(df.Zone==zone)].sort_values("Year")
                ax.plot(d.Year,d[metric],marker="o",ms=2.8,lw=1.4,color=COLORS[zone],label="Inside" if zone==INSIDE else "Outside")
                low=d.Valid_Area_Ratio<.70
                ax.scatter(d.loc[low,"Year"],d.loc[low,metric],s=45,facecolors="white",edgecolors=COLORS[zone],lw=1.2,zorder=4)
            ax.set_title(f"{land} — {label}")
            ax.set_ylabel(label)
            ax.grid(axis="y",alpha=.25)
    axes[-1,0].set_xlabel("Year"); axes[-1,1].set_xlabel("Year")
    handles=[Line2D([0],[0],color=COLORS[INSIDE],marker='o',label='Inside difficult-to-return zone'),
             Line2D([0],[0],color=COLORS[OUTSIDE],marker='o',label='Outside difficult-to-return zone'),
             Line2D([0],[0],marker='o',color='none',markerfacecolor='white',markeredgecolor='0.25',label='Valid area ratio < 0.70')]
    fig.legend(handles=handles,loc="upper center",ncol=3,frameon=False)
    fig.suptitle("Figure 2. Annual summer vegetation-index means by land-cover class and zone",y=.995,fontsize=14)
    fig.tight_layout(rect=[0,.01,1,.97]); save(fig,outdir,"Figure_2_Annual_NDVI_NDMI")


def event_figure(p,outdir,outcome,num):
    d=p[p.Outcome==outcome].sort_values("Year")
    fig,ax=plt.subplots(figsize=(9,5.2)); add_periods(ax); ax.axhline(0,color="black",lw=.8)
    ax.errorbar(d.Year,d.Coefficient,yerr=[d.Coefficient-d.Lower,d.Upper-d.Coefficient],fmt="o-",color="#4C78A8",ecolor="#4C78A8",capsize=3,lw=1.5,ms=4)
    ax.set(xlabel="Year",ylabel=f"{outcome} coefficient relative to 2010",
           title=f"Figure {num}. {outcome} event study: equal-weight mean across land-cover classes")
    ax.grid(axis="y",alpha=.25); save(fig,outdir,f"Figure_{num}_{outcome}_Event_Study")


def figure7(did,outdir):
    fig,axes=plt.subplots(1,4,figsize=(14,5.3),sharey=True)
    y=np.arange(len(LANDS))
    for ax,outcome in zip(axes,["NDVI","NDMI","EVI","NBR"]):
        d=did[did.Outcome==outcome].set_index("Land_Class").loc[LANDS]
        ax.axvline(0,color="black",lw=.8)
        ax.errorbar(d.Effect,y,xerr=[d.Effect-d.Lower,d.Upper-d.Effect],fmt="o",color="#4C78A8",capsize=3)
        ax.set_title(outcome);ax.set_xlabel("DID estimate")
        ax.grid(axis="x",alpha=.25)
    axes[0].set_yticks(y,LANDS); axes[0].invert_yaxis()
    fig.suptitle("Figure 7. Land-cover-specific difference-in-differences estimates (95% CI)",fontsize=14)
    fig.tight_layout(rect=[0,0,1,.94]); save(fig,outdir,"Figure_7_DID_Forest_Plot")


def figure8(sens,outdir):
    fig,axes=plt.subplots(4,5,figsize=(17,12),sharex=False)
    specs=list(sens.Specification.drop_duplicates())
    y=np.arange(len(specs))
    for r,outcome in enumerate(["NDVI","NDMI","EVI","NBR"]):
        for c,land in enumerate(LANDS):
            ax=axes[r,c]; d=sens[(sens.Outcome==outcome)&(sens.Land_Class==land)].set_index("Specification").loc[specs]
            ax.axvline(0,color="black",lw=.7)
            ax.errorbar(d.Effect,y,xerr=[d.Effect-d.Lower,d.Upper-d.Effect],fmt="o",ms=3.5,color=LAND_COLORS[land],capsize=2)
            if r==0: ax.set_title(land)
            if c==0: ax.set_ylabel(outcome)
            if r==3: ax.set_xlabel("DID estimate")
            if c==0: ax.set_yticks(y,specs,fontsize=8)
            else: ax.set_yticks(y,[])
            ax.invert_yaxis(); ax.grid(axis="x",alpha=.2)
    fig.suptitle("Figure 8. Sensitivity of DID estimates to year exclusions and valid-area thresholds",fontsize=14)
    fig.tight_layout(rect=[0,0,1,.96]); save(fig,outdir,"Figure_8_Sensitivity_Forest_Plot")


def supp_events(ev,outdir):
    for idx,outcome in enumerate(["NDVI","NDMI","EVI","NBR"],start=1):
        fig,axes=plt.subplots(3,2,figsize=(12,11),sharex=True,sharey=True); axes=axes.ravel()
        for ax,land in zip(axes,LANDS):
            d=ev[(ev.Outcome==outcome)&(ev.Land_Class==land)].sort_values("Year")
            add_periods(ax); ax.axhline(0,color="black",lw=.8)
            ax.plot(d.Year,d.Coefficient,"o-",lw=1.4,ms=3.5,color=LAND_COLORS[land]);ax.set_title(land);ax.grid(axis="y",alpha=.25)
        axes[-1].axis("off")
        for ax in axes[:5]: ax.set_ylabel(f"{outcome} relative to 2010")
        axes[4].set_xlabel("Year"); axes[3].set_xlabel("Year")
        fig.suptitle(f"Supplementary Figure S{idx}. {outcome} event study by land-cover class",fontsize=14)
        fig.tight_layout(rect=[0,0,1,.96]); save(fig,outdir,f"Supplementary_Figure_S{idx}_{outcome}_By_Class")


def supp_valid(df,outdir):
    fig,axes=plt.subplots(3,2,figsize=(12,10),sharex=True,sharey=True);axes=axes.ravel()
    for ax,land in zip(axes,LANDS):
        add_periods(ax)
        for zone in [INSIDE,OUTSIDE]:
            d=df[(df.Land_Class==land)&(df.Zone==zone)].sort_values("Year")
            ax.plot(d.Year,d.Valid_Area_Ratio,marker="o",ms=3,lw=1.3,color=COLORS[zone])
        for t in [.7,.8,.9]: ax.axhline(t,color="0.45",lw=.7,ls=":" if t!=.8 else "--")
        ax.set_title(land);ax.set_ylim(0,1.05);ax.grid(axis="y",alpha=.2)
    axes[-1].axis("off"); axes[4].set_xlabel("Year");axes[3].set_xlabel("Year")
    axes[0].set_ylabel("Valid area ratio");axes[2].set_ylabel("Valid area ratio");axes[4].set_ylabel("Valid area ratio")
    fig.legend(["Inside","Outside"],loc="upper center",ncol=2,frameon=False)
    fig.suptitle("Supplementary Figure S5. Annual valid-area ratio by land-cover class and zone",fontsize=14)
    fig.tight_layout(rect=[0,0,1,.95]); save(fig,outdir,"Supplementary_Figure_S5_Valid_Area_Ratio")


def supp_quantiles(df,outdir):
    fig,axes=plt.subplots(5,2,figsize=(12,15),sharex=True)
    for i,land in enumerate(LANDS):
      for j,outcome in enumerate(["NDVI","NDMI"]):
        ax=axes[i,j]; add_periods(ax)
        p10=f"{outcome}_p10";p25=f"{outcome}_p25";p75=f"{outcome}_p75";p90=f"{outcome}_p90";mean=f"{outcome}_mean"
        # Inside shown because distributional change within the target zone is the focus.
        d=df[(df.Land_Class==land)&(df.Zone==INSIDE)].sort_values("Year")
        x=d.Year.to_numpy();
        ax.fill_between(x,d[p10].to_numpy(),d[p90].to_numpy(),color="#9ecae1",alpha=.35,label="p10-p90")
        ax.fill_between(x,d[p25].to_numpy(),d[p75].to_numpy(),color="#3182bd",alpha=.35,label="p25-p75")
        ax.plot(x,d[mean].to_numpy(),color="#08519c",lw=1.5,label="Mean")
        ax.set_title(f"{land} — {outcome} (inside zone)");ax.set_ylabel(outcome);ax.grid(axis="y",alpha=.2)
    axes[-1,0].set_xlabel("Year");axes[-1,1].set_xlabel("Year")
    fig.legend(loc="upper center",ncol=3,frameon=False)
    fig.suptitle("Supplementary Figure S6. Annual index distributions inside the difficult-to-return zone",fontsize=14)
    fig.tight_layout(rect=[0,0,1,.96]); save(fig,outdir,"Supplementary_Figure_S6_Quantile_Bands")


def run(csv_path,outdir):
    outdir.mkdir(parents=True,exist_ok=True)
    df=pd.read_csv(csv_path)
    gaps=gaps_from_df(df); did=main_did(gaps); ev,p=event_data(gaps); sens=sensitivity(gaps)
    figure2(df,outdir)
    for outcome,num in zip(["NDVI","NDMI","EVI","NBR"],[3,4,5,6]): event_figure(p,outdir,outcome,num)
    figure7(did,outdir); figure8(sens,outdir); supp_events(ev,outdir); supp_valid(df,outdir); supp_quantiles(df,outdir)
    did.to_csv(outdir/"figure7_DID_data.csv",index=False)
    sens.to_csv(outdir/"figure8_sensitivity_data.csv",index=False)
    ev.to_csv(outdir/"supplementary_event_study_by_class_data.csv",index=False)
    p.to_csv(outdir/"figures3_6_pooled_event_study_data.csv",index=False)
    return outdir

if __name__=="__main__":
    ap=argparse.ArgumentParser()
    ap.add_argument("--input",default="/mnt/data/New_Summer_Vegetation_Statistics_All_Phases.csv")
    ap.add_argument("--outdir",default="/mnt/data/manuscript_figures")
    a=ap.parse_args(); run(Path(a.input),Path(a.outdir))
    print("Figures written to",a.outdir)
