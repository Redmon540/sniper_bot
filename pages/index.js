import Head from "next/head";
import React, { useEffect, useState } from "react";
import styles from "../styles/Home.module.css";

import { AptosClient } from "aptos";
import { useWallet } from "@manahippo/aptos-wallet-adapter";
import cmHelper from "../helpers/candyMachineHelper";
import ConnectWalletButton from "../helpers/Aptos/ConnectWalletButton";
import {
  candyMachineAddress,
  collectionName,
  collectionCoverUrl,
  NODE_URL,
  CONTRACT_ADDRESS,
  COLLECTION_SIZE,
} from "../helpers/config";

import Spinner from "react-bootstrap/Spinner";
import Modal from "react-bootstrap/Modal";
import { Col, Row, Table } from "react-bootstrap";
import NumericInput from "react-numeric-input";
import { toast } from "react-toastify";
import axios from "axios";

const aptosClient = new AptosClient(NODE_URL);
const autoCmRefresh = 10000;

export default function Home() {
  const wallet = useWallet();
  const [collections, setCollections] = useState([]);
  const [isFetchignCmData, setIsFetchignCmData] = useState(false);
  const [candyMachineData, setCandyMachineData] = useState({
    data: {},
    // fetch: fetchCandyMachineData,
  });
  const [timeLeftToMint, setTimeLeftToMint] = useState({
    presale: "",
    public: "",
    timeout: null,
  });

  const [mintInfo, setMintInfo] = useState({
    numToMint: 1,
    minting: false,
    success: false,
    mintedNfts: [],
  });

  const [canMint, setCanMint] = useState(false);

  const mint = async () => {
    if (wallet.account?.address?.toString() === undefined || mintInfo.minting)
      return;

    console.log(wallet.account?.address?.toString());
    setMintInfo({ ...mintInfo, minting: true });
    // Generate a transaction
    const payload = {
      type: "entry_function_payload",
      function: `${CONTRACT_ADDRESS}::candy_machine_v2::mint_tokens`,
      type_arguments: [],
      arguments: [candyMachineAddress, collectionName, mintInfo.numToMint],
    };

    let txInfo;

    try {
      const txHash = await wallet.signAndSubmitTransaction(payload);
      console.log(txHash);
      txInfo = await aptosClient.waitForTransactionWithResult(txHash.hash);
    } catch (err) {
      txInfo = {
        success: false,
        vm_status: err.message,
      };
    }
    handleMintTxResult(txInfo);
    if (txInfo.success)
      setCandyMachineData({
        ...candyMachineData,
        data: {
          ...candyMachineData.data,
          numMintedTokens: (
            parseInt(candyMachineData.data.numMintedTokens) +
            parseInt(mintInfo.numToMint)
          ).toString(),
        },
      });
  };

  async function handleMintTxResult(txInfo) {
    console.log(txInfo);
    const mintSuccess = txInfo.success;
    console.log(
      mintSuccess ? "Mint success!" : `Mint failure, an error occured.`
    );

    let mintedNfts = [];
    if (!mintSuccess) {
      /// Handled error messages
      const handledErrorMessages = new Map([
        ["Failed to sign transaction", "An error occured while signing."],
        [
          "Move abort in 0x1::coin: EINSUFFICIENT_BALANCE(0x10006): Not enough coins to complete transaction",
          "Insufficient funds to mint.",
        ],
      ]);

      const txStatusError = txInfo.vm_status;
      console.error(`Mint not successful: ${txStatusError}`);
      let errorMessage = handledErrorMessages.get(txStatusError);
      errorMessage =
        errorMessage === undefined
          ? "Unkown error occured. Try again."
          : errorMessage;

      toast.error(errorMessage);
    } else {
      mintedNfts = await cmHelper.getMintedNfts(
        aptosClient,
        candyMachineData.data.tokenDataHandle,
        candyMachineData.data.cmResourceAccount,
        collectionName,
        txInfo
      );
      toast.success("Minting success!");
    }

    setMintInfo({
      ...mintInfo,
      minting: false,
      success: mintSuccess,
      mintedNfts,
    });
  }

  async function fetchCandyMachineData(indicateIsFetching = false) {
    console.log("Fetching candy machine data...");
    if (indicateIsFetching) setIsFetchignCmData(true);
    const cmResourceAccount = null; // = await cmHelper.getCandyMachineResourceAccount();
    console.log(">>>>", cmResourceAccount);
    if (cmResourceAccount === null) {
      setCandyMachineData({ ...candyMachineData, data: {} });
      setIsFetchignCmData(false);
      return;
    }

    const collectionInfo = await cmHelper.getCandyMachineCollectionInfo(
      cmResourceAccount
    );
    const configData = await cmHelper.getCandyMachineConfigData(
      collectionInfo.candyMachineConfigHandle
    );
    setCandyMachineData({
      ...candyMachineData,
      data: { cmResourceAccount, ...collectionInfo, ...configData },
    });
    setIsFetchignCmData(false);
  }

  function verifyTimeLeftToMint() {
    const mintTimersTimeout = setTimeout(verifyTimeLeftToMint, 1000);
    if (
      candyMachineData.data.presaleMintTime === undefined ||
      candyMachineData.data.publicMintTime === undefined
    )
      return;

    const currentTime = Math.round(new Date().getTime() / 1000);
    setTimeLeftToMint({
      timeout: mintTimersTimeout,
      presale: cmHelper.getTimeDifference(
        currentTime,
        candyMachineData.data.presaleMintTime
      ),
      public: cmHelper.getTimeDifference(
        currentTime,
        candyMachineData.data.publicMintTime
      ),
    });
  }

  async function fetchCollections() {
    const originURL =
      window.location.protocol + "//" + window.location.hostname + ":" + 3004;
    let API = originURL + "/api/collections";
    let result = await axios({
      method: "GET",
      url: API,
      headers: {
        "Content-Type": "application/json",
      },
      data: {
        limit: 1,
      },
    });
    let res = await result.data;
    setCollections(res);
  }

  useEffect(() => {
    fetchCollections();
    // fetchCandyMachineData(true);
    // setInterval(fetchCandyMachineData, autoCmRefresh);
  }, []);

  useEffect(() => {
    if (!wallet.autoConnect && wallet.wallet?.adapter) {
      wallet.connect();
    }
  }, [wallet.autoConnect, wallet.wallet, wallet.connect]);

  useEffect(() => {
    setCanMint(true);
  }, [wallet, candyMachineData, timeLeftToMint]);

  return (
    <div className="bg-gray-500">
      <div className={styles.container}>
        <Head>
          <title>Aptos NFT Mint</title>
          <meta name="description" content="Aptos NFT Mint" />
          <link rel="icon" href="/favicon.ico" />
        </Head>

        <main className={styles.main}>
          <h1 className={styles.title}>{collectionName}</h1>
          <div className={styles.topcorner}>
            <ConnectWalletButton
              connectButton={!wallet.connected}
              className="d-flex"
            />
          </div>
          <img src={collectionCoverUrl} className={styles.imgLogo} />
          <Table bordered hover variant="dark">
            <thead>
              <tr>
                <th>CollectionName</th>
                <th>Supply</th>
                <th>Minted</th>
                <th>MaxMintAmount</th>
                <th>YourMintAmount</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {collections.map((collection) => {
                return (
                  <tr key={collection._id}>
                    <td className={styles.td}>{collection.collection_name}</td>
                    <td className={styles.td}>{collection.supply}</td>
                    <td className={styles.td}>0</td>
                    <td className={styles.td}>{collection.max_mint_amount}</td>
                    <td className={styles.tdNum}>
                      <NumericInput
                        className={styles.inputNumber}
                        mobile
                        max={5}
                        min={1}
                        defaultValue={1}
                        value={mintInfo.numToMint}
                        // onChange={(e) =>
                        //   setMintInfo({ ...mintInfo, numToMint: e.target.value })
                        // }
                      />
                    </td>
                    <td className={styles.td}>
                      <button
                        className={styles.button}
                        onClick={mint}
                        disabled={!canMint}
                      >
                        {mintInfo.minting ? (
                          <Spinner animation="border" role="status">
                            <span className="visually-hidden">Loading...</span>
                          </Spinner>
                        ) : (
                          "Mint"
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>

          <Modal
            id="mint-results-modal"
            show={mintInfo.success}
            onHide={() =>
              setMintInfo({ ...mintInfo, success: false, mintedNfts: [] })
            }
            centered
            size="lg"
          >
            <Modal.Body className="d-flex flex-column align-items-center pt-5 pb-3">
              <div
                className="d-flex justify-content-center w-100 my-5"
                style={{ flexWrap: "wrap" }}
              >
                {mintInfo.mintedNfts.map((mintedNft) => (
                  <div
                    key={mintedNft.name}
                    className={`${styles.mintedNftCard} d-flex flex-column mx-3`}
                  >
                    <img
                      src={
                        mintedNft.imageUri === null ? "" : mintedNft.imageUri
                      }
                    />
                    <h5 className="text-white text-center mt-2">
                      {mintedNft.name}
                    </h5>
                  </div>
                ))}
              </div>
            </Modal.Body>
          </Modal>
        </main>
      </div>
    </div>
  );
}
