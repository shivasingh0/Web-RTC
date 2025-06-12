import React, { useEffect, useRef, useState } from "react";
import io from "socket.io-client";
import {
  Phone,
  PhoneCall,
  Video,
  VideoOff,
  Monitor,
  PhoneOff,
  Copy,
  Check,
  MonitorOff,
} from "lucide-react";

const socket = io("http://localhost:9000");

const App = () => {
  const [mySocketId, setMySocketId] = useState(null);
  const [remoteSocketId, setRemoteSocketId] = useState("");
  const [incomingCall, setIncomingCall] = useState(null);
  const [inCall, setInCall] = useState(false);
  const [camera, setCamera] = useState(false);
  const [copied, setCopied] = useState(false);
  const [screen, setScreen] = useState(false);

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
      await peerConnectionRef?.current?.setRemoteDescription(
        new RTCSessionDescription(answer)
      );
      setInCall(true);
    });

    socket.on("ice-candidate", async ({ candidate }) => {
      try {
        await peerConnectionRef.current?.addIceCandidate(candidate);
      } catch (error) {
        console.error("Error adding ICE candidate", error);
      }
    });
  }, []);

  const startMedia = async () => {
    setCamera(true);
    const stream = await navigator.mediaDevices?.getUserMedia({
      video: true,
      audio: true,
    });
    localStreamRef.current = stream;
    localVideoRef.current.srcObject = stream;
  };

  const endMedia = () => {
    setCamera(false);
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    localVideoRef.current.srcObject = null;
  };

  const callUser = async (targetSocketId) => {
    console.log(targetSocketId);
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
    const stream = await navigator.mediaDevices?.getUserMedia({
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
    setCamera(true);
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
       localVideoRef.current.srcObject = screenStream;
    localStreamRef.current = screenStream; 
    setScreen(true); 

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
         setScreen(false);
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
    setCamera(false);
    setScreen(false);
    setIncomingCall(null);
  };

  const copySocketId = async () => {
    try {
      await navigator.clipboard.writeText(mySocketId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy socket ID");
    }
  };

  const stopShareScreen = () => {
    localVideoRef.current.srcObject = null;
    setScreen(false);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Video Call App</h1>
          <p className="text-blue-200">
            Connect with others through high-quality video calls
          </p>
        </div>

        {/* Socket ID Display */}
        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 mb-6 border border-white/20">
          <h3 className="text-white font-semibold mb-2">My Socket ID:</h3>
          <div className="flex items-center space-x-3">
            <code className="bg-green-500/20 text-green-300 px-4 py-2 rounded-lg font-mono text-sm border border-green-500/30">
              {mySocketId}
            </code>
            {mySocketId && (
              <button
                onClick={copySocketId}
                className="p-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 rounded-lg transition-colors border border-blue-500/30"
                title="Copy Socket ID"
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </button>
            )}
          </div>
        </div>

        {/* Remote Socket ID Input */}
        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 mb-6 border border-white/20">
          <h3 className="text-white font-semibold mb-4">
            Connect to Remote User
          </h3>
          <input
            type="text"
            placeholder="Remote Socket ID"
            className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent backdrop-blur-sm"
            value={remoteSocketId}
            onChange={(e) => setRemoteSocketId(e.target.value)}
          />
        </div>

        {/* Incoming Call Modal */}
        {incomingCall && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
              <div className="text-center">
                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <PhoneCall className="w-10 h-10 text-green-600 animate-pulse" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  Incoming Call
                </h3>
                <p className="text-gray-600 mb-6">
                  From: {incomingCall.caller}
                </p>
                <div className="flex space-x-4">
                  <button
                    onClick={() => setIncomingCall(null)}
                    className="flex-1 bg-red-500 hover:bg-red-600 text-white px-6 py-3 rounded-xl transition-colors font-medium"
                  >
                    Decline
                  </button>
                  <button
                    onClick={() => acceptCall(incomingCall)}
                    className="flex-1 bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-xl transition-colors font-medium"
                  >
                    Accept
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Call Controls */}
        {!incomingCall && (
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 mb-6 border border-white/20">
            <div className="flex flex-wrap gap-3 justify-center">
              {camera ? (
                <>
                  <button
                    className="flex items-center space-x-2 bg-red-500 hover:bg-red-600 text-white px-6 py-3 rounded-xl transition-all duration-200 font-medium transform hover:scale-105"
                    onClick={endMedia}
                  >
                    <VideoOff size={20} />
                    <span>Camera OFF</span>
                  </button>
                  <button
                    className="flex items-center space-x-2 bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-xl transition-all duration-200 font-medium transform hover:scale-105"
                    onClick={() => callUser(remoteSocketId)}
                  >
                    <Phone size={20} />
                    <span>Call</span>
                  </button>
                </>
              ) : (
                <button
                  className="flex items-center space-x-2 bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-xl transition-all duration-200 font-medium transform hover:scale-105"
                  onClick={startMedia}
                >
                  <Video size={20} />
                  <span>Camera On</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Video Display */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Local Video */}
          <div className="aspect-video bg-gray-900 rounded-xl overflow-hidden relative">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
              style={{ display: camera ? "block" : "none" }}
            />
            {!camera && (
              <div className="absolute inset-0 w-full h-full flex items-center justify-center">
                <div className="text-center">
                  <VideoOff className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                  <p className="text-gray-400">Please turn on camera</p>
                </div>
              </div>
            )}
          </div>

          {/* Remote Video */}
          <div className="aspect-video bg-gray-900 rounded-xl overflow-hidden relative">
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
              style={{ display: inCall ? "block" : "none" }}
            />
            {!inCall && (
              <div className="absolute inset-0 w-full h-full flex items-center justify-center">
                <div className="text-center">
                  <Phone className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                  <p className="text-gray-400">Please make a call</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* In-Call Controls */}
        {inCall && (
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/20">
            <h3 className="text-white font-semibold mb-4">Call Controls</h3>
            <div className="flex flex-wrap gap-3 justify-center">
              {screen ? (
                <button
                  onClick={stopShareScreen}
                  className="flex items-center space-x-2 bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-xl transition-all duration-200 font-medium transform hover:scale-105"
                >
                  <MonitorOff size={20} />
                  <span>Stop Sharing</span>
                </button>
              ) : (
                <button
                  onClick={shareScreen}
                  className="flex items-center space-x-2 bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-xl transition-all duration-200 font-medium transform hover:scale-105"
                >
                  <Monitor size={20} />
                  <span>Share Screen</span>
                </button>
              )}
              <button
                className="flex items-center space-x-2 bg-red-500 hover:bg-red-600 text-white px-6 py-3 rounded-xl transition-all duration-200 font-medium transform hover:scale-105"
                onClick={disconnectCall}
              >
                <PhoneOff size={20} />
                <span>Disconnect</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
