"""
draw_ci_diagrams.py — Generalised diagram generator for CI Scenario documents
Draws Data Flow Diagrams (DFD) and Technical Integration Diagrams (TID)
matching the exact grey-box style used in SAP CI Scenario Word documents.

Usage:
  DFD:
    python scripts/draw_ci_diagrams.py --type dfd
      --source "SAP Sales Cloud V2" --source-oval "Contact Request"
      --target "DQS" --target-oval "Validation Response"
      --out "C:\\...\\dfd.png"

  TID:
    python scripts/draw_ci_diagrams.py --type tid
      --source "SAP Sales Cloud V2" --cpi-adapters "HTTPS,HTTP,JMS"
      --receiver "DQS" --protocol "HTTPs" --auth "OAuth2 Client Credentials"
      --out "C:\\...\\tid.png"
"""
import argparse
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import os
import sys

BOX_COLOR = '#D9D9D9'
BOX_EDGE  = '#000000'
WHITE     = '#FFFFFF'
BLUE      = '#4472C4'
RED       = '#FF0000'
BLACK     = '#000000'
ORANGE    = '#ED7D31'


def draw_dfd(source_label, source_oval, target_label, target_oval, out_path):
    """Draw Data Flow Diagram — grey source box + oval + arrow + grey target box."""
    fig, ax = plt.subplots(figsize=(8, 2.2))
    ax.set_xlim(0, 10); ax.set_ylim(0, 3); ax.axis('off')
    fig.patch.set_facecolor('white')

    # Source box
    ax.add_patch(mpatches.Rectangle((0.3,0.3),3.6,2.4,linewidth=1.5,edgecolor=BOX_EDGE,facecolor=BOX_COLOR))
    ax.text(2.1,2.35,f'Source: {source_label}',ha='center',va='center',fontsize=9,fontweight='bold')
    ax.add_patch(mpatches.Ellipse((2.1,1.3),2.6,0.9,linewidth=1.5,edgecolor=BOX_EDGE,facecolor=WHITE))
    ax.text(2.1,1.3,source_oval,ha='center',va='center',fontsize=8.5,multialignment='center')

    # Arrow
    ax.annotate('',xy=(6.1,1.3),xytext=(3.9,1.3),arrowprops=dict(arrowstyle='->',color=BLACK,lw=1.5))

    # Target box
    ax.add_patch(mpatches.Rectangle((6.1,0.3),3.6,2.4,linewidth=1.5,edgecolor=BOX_EDGE,facecolor=BOX_COLOR))
    ax.text(7.9,2.35,f'Target: {target_label}',ha='center',va='center',fontsize=9,fontweight='bold')
    ax.add_patch(mpatches.Ellipse((7.9,1.3),2.6,0.9,linewidth=1.5,edgecolor=BOX_EDGE,facecolor=WHITE))
    ax.text(7.9,1.3,target_oval,ha='center',va='center',fontsize=8.5,multialignment='center')

    plt.tight_layout(pad=0.1)
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    plt.savefig(out_path,dpi=150,bbox_inches='tight',facecolor='white',edgecolor='none')
    plt.close()
    print(f'DFD saved: {out_path}')


def draw_tid(source, adapters, receiver, protocol, auth, out_path, extra_receiver=None):
    """Draw Technical Integration Diagram — sender | CPI box with adapters | receiver."""
    adapter_list = [a.strip() for a in adapters.split(',') if a.strip()]
    has_jms = any('JMS' in a.upper() for a in adapter_list)
    main_adapters = [a for a in adapter_list if 'JMS' not in a.upper()]

    fig, ax = plt.subplots(figsize=(12, 3.5))
    ax.set_xlim(0, 14); ax.set_ylim(0, 4.5); ax.axis('off')
    fig.patch.set_facecolor('white')

    # ── Source Box ──────────────────────────────────────────────────
    ax.add_patch(mpatches.Rectangle((0.2,0.8),2.4,2.8,linewidth=1.5,edgecolor=BOX_EDGE,facecolor=BOX_COLOR))
    ax.text(1.4,3.35,source,ha='center',va='center',fontsize=8.5,fontweight='bold',multialignment='center')
    ax.add_patch(mpatches.Rectangle((0.4,1.1),2.0,1.6,linewidth=1,edgecolor=BOX_EDGE,facecolor=WHITE))
    ax.text(1.4,1.9,'client',ha='center',va='center',fontsize=8,color=BLUE)

    # ── Arrow Source → CPI ──────────────────────────────────────────
    ax.annotate('',xy=(4.0,1.9),xytext=(2.6,1.9),arrowprops=dict(arrowstyle='->',color=BLACK,lw=1.5))
    ax.text(3.3,2.25,protocol,ha='center',va='center',fontsize=7.5,color=ORANGE,fontweight='bold')

    # ── CPI Box ─────────────────────────────────────────────────────
    cpi_width = 0.9 + len(main_adapters) * 1.5 + (0.6 if has_jms else 0)
    ax.add_patch(mpatches.Rectangle((4.0,0.8),cpi_width,2.8,linewidth=1.5,edgecolor=BOX_EDGE,facecolor=BOX_COLOR))
    ax.text(4.0+cpi_width/2,3.35,'CPI',ha='center',va='center',fontsize=8.5,fontweight='bold')

    # Adapter boxes inside CPI
    ax_pos = 4.2
    prev_x = None
    for adapter in main_adapters:
        ax.add_patch(mpatches.Rectangle((ax_pos,1.3),1.4,1.2,linewidth=1,edgecolor=BOX_EDGE,facecolor=WHITE))
        ax.text(ax_pos+0.7,1.9,adapter+'\nAdapter',ha='center',va='center',fontsize=7)
        if prev_x is not None:
            ax.annotate('',xy=(ax_pos,1.9),xytext=(prev_x+1.4,1.9),arrowprops=dict(arrowstyle='->',color=BLACK,lw=1))
            ax.text((prev_x+1.4+ax_pos)/2,1.6,'flow',ha='center',va='center',fontsize=6.5,color='gray')
        prev_x = ax_pos
        ax_pos += 1.5

    if has_jms:
        ax.add_patch(mpatches.Rectangle((ax_pos,1.3),0.6,1.2,linewidth=1,edgecolor=BOX_EDGE,facecolor=WHITE))
        ax.text(ax_pos+0.3,1.9,'JMS',ha='center',va='center',fontsize=7)

    cpi_right = 4.0 + cpi_width

    # ── Network boundary line ────────────────────────────────────────
    boundary_x = cpi_right + 0.7
    ax.plot([boundary_x,boundary_x],[0.5,4.0],color=RED,lw=1.5)
    ax.text(boundary_x,4.15,protocol,ha='center',va='center',fontsize=7.5,color=ORANGE,fontweight='bold')

    # Auth circle
    circ_x = boundary_x + 0.15
    ax.add_patch(mpatches.Circle((circ_x,1.9),0.22,linewidth=1,edgecolor=BLACK,facecolor=WHITE))
    ax.text(circ_x,1.9,'R',ha='center',va='center',fontsize=6.5,fontweight='bold')
    ax.text(circ_x,1.55,auth[:12],ha='center',va='center',fontsize=5.5)

    # ── Arrow CPI → Receiver ─────────────────────────────────────────
    recv_x = boundary_x + 0.8
    ax.annotate('',xy=(recv_x,1.9),xytext=(cpi_right,1.9),arrowprops=dict(arrowstyle='->',color=BLACK,lw=1.5))

    # ── Receiver Box ─────────────────────────────────────────────────
    recv_w = min(2.2, 14 - recv_x - 0.3) if not has_jms else 1.8
    ax.add_patch(mpatches.Rectangle((recv_x,0.8),recv_w,2.8,linewidth=1.5,edgecolor=BOX_EDGE,facecolor=BOX_COLOR))
    ax.text(recv_x+recv_w/2,3.35,receiver,ha='center',va='center',fontsize=8.5,fontweight='bold')
    ax.add_patch(mpatches.Rectangle((recv_x+0.2,1.1),recv_w-0.4,1.6,linewidth=1,edgecolor=BOX_EDGE,facecolor=WHITE))
    ax.text(recv_x+recv_w/2,1.9,'HTTP',ha='center',va='center',fontsize=8,color=BLUE)

    # ── JMS Queue box (if applicable) ────────────────────────────────
    if has_jms:
        jms_x = recv_x + recv_w + 0.3
        jms_w = min(1.9, 14 - jms_x - 0.2)
        ax.add_patch(mpatches.Rectangle((jms_x,1.3),jms_w,1.2,linewidth=1.5,edgecolor=BOX_EDGE,facecolor=BOX_COLOR))
        ax.text(jms_x+jms_w/2,1.9,'JMS Queue',ha='center',va='center',fontsize=7.5,fontweight='bold')
        ax.annotate('',xy=(jms_x,1.6),xytext=(recv_x,1.6),arrowprops=dict(arrowstyle='->',color=BLACK,lw=1.2,connectionstyle='arc3,rad=0.2'))
        ax.text((recv_x+jms_x)/2,1.1,'JMS',ha='center',va='center',fontsize=7,color=ORANGE)

    # ── Network zone labels ───────────────────────────────────────────
    zone5_right = cpi_right + 0.3
    ax.plot([0.2,zone5_right],[0.55,0.55],color=BLACK,lw=1)
    ax.plot([0.2,0.2],[0.55,0.7],color=BLACK,lw=1)
    ax.plot([zone5_right,zone5_right],[0.55,0.7],color=BLACK,lw=1)
    ax.text((0.2+zone5_right)/2,0.3,'Network Zone 5',ha='center',va='center',fontsize=7.5)

    zone1_right = min(recv_x+recv_w+0.2, 13.8)
    ax.plot([recv_x,zone1_right],[0.55,0.55],color=BLACK,lw=1)
    ax.plot([recv_x,recv_x],[0.55,0.7],color=BLACK,lw=1)
    ax.plot([zone1_right,zone1_right],[0.55,0.7],color=BLACK,lw=1)
    ax.text((recv_x+zone1_right)/2,0.3,'Network Zone 1',ha='center',va='center',fontsize=7.5)

    plt.tight_layout(pad=0.1)
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    plt.savefig(out_path,dpi=150,bbox_inches='tight',facecolor='white',edgecolor='none')
    plt.close()
    print(f'TID saved: {out_path}')


def main():
    parser = argparse.ArgumentParser(description='Draw CI Scenario diagrams')
    parser.add_argument('--type', required=True, choices=['dfd','tid'], help='Diagram type')
    parser.add_argument('--out', required=True, help='Output PNG path')
    # DFD args
    parser.add_argument('--source', help='Source system name')
    parser.add_argument('--source-oval', help='Text inside source oval')
    parser.add_argument('--target', help='Target system name')
    parser.add_argument('--target-oval', help='Text inside target oval')
    # TID args
    parser.add_argument('--cpi-adapters', help='Comma-separated adapter names e.g. HTTPS,HTTP,JMS')
    parser.add_argument('--receiver', help='Receiver system name')
    parser.add_argument('--protocol', default='HTTPs', help='Protocol label on arrow e.g. HTTPs, TCP/SMF, SOAP')
    parser.add_argument('--auth', default='Client Certificate', help='Auth type e.g. OAuth2, Basic, Client Certificate')

    args = parser.parse_args()

    if args.type == 'dfd':
        if not all([args.source, args.source_oval, args.target, args.target_oval]):
            print('ERROR: DFD requires --source, --source-oval, --target, --target-oval', file=sys.stderr)
            sys.exit(1)
        draw_dfd(args.source, args.source_oval, args.target, args.target_oval, args.out)

    elif args.type == 'tid':
        if not all([args.source, args.cpi_adapters, args.receiver]):
            print('ERROR: TID requires --source, --cpi-adapters, --receiver', file=sys.stderr)
            sys.exit(1)
        draw_tid(args.source, args.cpi_adapters, args.receiver, args.protocol, args.auth, args.out)


if __name__ == '__main__':
    main()
