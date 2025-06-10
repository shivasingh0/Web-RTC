import React, { useEffect, useRef, useState } from "react";
import io from "socket.io-client";

const socket = io("http://localhost:9000");

const App = () => {
  const [mySocketId, setMySocketId] = useState(null);
  const [remoteSocketId, setRemoteSocketId] = useState("");
  const [incomingCall, setIncomingCall] = useState(null);
  const [inCall, setInCall] = useState(false);
  const [camera, setCamera] = useState(false);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);

  const servers = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  };

  useEffect(() => {
    socket.on("connect", () => {
      setMySocketId(socket.id);
    });

    socket.on("incoming-call", async ({ offer, caller }) => {
      setIncomingCall({ offer, caller });
    });

    socket.on("call-answered", async ({ answer }) => {
      await peerConnectionRef.current.setRemoteDescription(
        new RTCSessionDescription(answer)
      );
      setInCall(true);
    });

    socket.on("ice-candidate", async ({ candidate }) => {
      try {
        await peerConnectionRef.current.addIceCandidate(candidate);
      } catch (error) {
        console.error("Error adding ICE candidate", error);
      }
    });
  }, []);

  const startMedia = async () => {
    setCamera(true);
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    localStreamRef.current = stream;
    localVideoRef.current.srcObject = stream;
  };

  const endMedia = () => {
    setCamera(false);
    localStreamRef.current.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    localVideoRef.current.srcObject = null;
  };

  const callUser = async (targetSocketId) => {
    peerConnectionRef.current = new RTCPeerConnection(servers);

    localStreamRef?.current?.getTracks()?.forEach((track) => {
      peerConnectionRef?.current?.addTrack(track, localStreamRef?.current);
    });

    peerConnectionRef.current.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit("ice-candidate", {
          target: targetSocketId,
          candidate: e.candidate,
        });
      }
    };

    peerConnectionRef.current.ontrack = (e) => {
      remoteVideoRef.current.srcObject = e.streams[0];
    };

    const offer = await peerConnectionRef?.current?.createOffer();
    await peerConnectionRef.current.setLocalDescription(offer);

    socket.emit("call-user", {
      offer: {
        sdp: offer.sdp,
        type: offer.type,
      },
      target: targetSocketId,
      caller: socket.id,
    });
  };

  const acceptCall = async ({ offer, caller }) => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });

    localVideoRef.current.srcObject = stream;
    localStreamRef.current = stream;

    peerConnectionRef.current = new RTCPeerConnection(servers);

    stream.getTracks().forEach((track) => {
      peerConnectionRef?.current?.addTrack(track, stream);
    });

    peerConnectionRef.current.ontrack = (e) => {
      remoteVideoRef.current.srcObject = e.streams[0];
    };

    peerConnectionRef.current.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit("ice-candidate", {
          target: caller,
          candidate: e.candidate,
        });
      }
    };

    await peerConnectionRef.current.setRemoteDescription(
      new RTCSessionDescription(offer)
    );

    const answer = await peerConnectionRef.current.createAnswer();
    await peerConnectionRef.current.setLocalDescription(answer);

    socket.emit("answer-call", {
      answer: {
        sdp: answer.sdp,
        type: answer.type,
      },
      target: caller,
    });
    setInCall(true);
    setIncomingCall(null);
  };

  const shareScreen = async () => {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
      });

      const screenTrack = screenStream.getVideoTracks()[0];

      const sender = peerConnectionRef.current
        ?.getSenders()
        .find((s) => s.track.kind === "video");

      if (sender) {
        sender.replaceTrack(screenTrack);
      }

      localVideoRef.current.srcObject = screenStream;

      screenTrack.onended = async () => {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });

        const newVideoTrack = stream.getVideoTracks()[0];

        const sender = peerConnectionRef.current
          .getSenders()
          .find((s) => s.track.kind === "video");

        if (sender) {
          sender.replaceTrack(newVideoTrack);
        }

        localVideoRef.current.srcObject = stream;
        localStreamRef.current = stream;
      };
    } catch (error) {
      console.error("Error sharing screen:", error);
    }
  };

  const disconnectCall = () => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    remoteVideoRef.current.srcObject = null;
    localVideoRef.current.srcObject = null;

    setInCall(false);
    setIncomingCall(null);
  };

  return (
    <div>
      <h2>My Socket ID: {mySocketId}</h2>
      <input
        type="text"
        placeholder="Remote Socket ID"
        value={remoteSocketId}
        onChange={(e) => setRemoteSocketId(e.target.value)}
      />
      <br />
      {incomingCall ? (
        <>
          <p>Incoming call from {incomingCall.caller}</p>
          <button onClick={() => acceptCall(incomingCall)}>Accept</button>
        </>
      ) : (
        <>
          {camera ? (
            <>
              <button onClick={endMedia}>Camera OFF</button>
              <button onClick={() => callUser(remoteSocketId)}>Call</button>
            </>
          ) : (
            <button onClick={startMedia}>Camera On</button>
          )}
        </>
      )}
      <div style={{ display: "flex", marginTop: "10px" }}>
        <video ref={localVideoRef} autoPlay playsInline muted width="300" />
        <video ref={remoteVideoRef} autoPlay playsInline width="300" />
      </div>
      {inCall && (
        <div style={{ marginTop: "10px" }}>
          <button onClick={shareScreen}>Share Screen</button>
          <button onClick={disconnectCall}>Disconnect</button>
        </div>
      )}
    </div>
  );
};

export default App;
