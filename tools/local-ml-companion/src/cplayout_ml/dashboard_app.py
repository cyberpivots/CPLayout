from __future__ import annotations

import os
from pathlib import Path

import streamlit as st

try:
    from .dashboard import dashboard_model
except ImportError:
    from cplayout_ml.dashboard import dashboard_model


def main() -> None:
    packet_path = Path(os.environ.get("CPLAYOUT_COMPANION_PACKET", ""))
    st.set_page_config(page_title="CPLayout Companion Report", layout="wide")
    st.title("CPLayout Companion Report")
    if not packet_path.exists():
        st.error("Set CPLAYOUT_COMPANION_PACKET to a local companion evidence packet.")
        return
    model = dashboard_model(packet_path)
    health = model["packetHealth"]
    calibration = model["crsCalibration"]
    provenance = model["localProvenance"]

    summary_cols = st.columns(5)
    summary_cols[0].metric("Evidence", health["evidenceCount"])
    summary_cols[1].metric("Candidates", health["candidateReportCount"])
    summary_cols[2].metric("Projected XY", health["projectedFeatureCount"])
    summary_cols[3].metric("Metadata Only", calibration["metadataOnlyCandidateCount"])
    summary_cols[4].metric("Failures", health["failureCount"])

    st.subheader("Packet Health")
    st.json({
        "projectId": health["projectId"],
        "projectCrs": health["projectCrs"],
        "packetVersion": health["packetVersion"],
        "status": health["status"],
        "calibrationStatus": calibration["calibrationStatus"],
        "localProvenance": provenance,
    })

    st.subheader("Candidate Reports")
    st.dataframe(model["candidateRows"], width="stretch")
    st.subheader("Hard Failures And Warnings")
    st.dataframe([{"warning": warning} for warning in model["warnings"]], width="stretch")
    st.subheader("Evidence Records")
    st.dataframe(model["evidenceRows"], width="stretch")
    st.subheader("Artifact Hashes")
    st.dataframe(model["artifactRows"], width="stretch")
    st.subheader("Projected XY Features")
    st.dataframe(model["projectedFeatureRows"], width="stretch")


if __name__ == "__main__":
    main()
