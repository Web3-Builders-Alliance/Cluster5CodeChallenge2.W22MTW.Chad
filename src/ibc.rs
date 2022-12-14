use cosmwasm_std::{
    entry_point, from_slice, DepsMut, Env, Ibc3ChannelOpenResponse, IbcBasicResponse,
    IbcChannelCloseMsg, IbcChannelConnectMsg, IbcChannelOpenMsg, IbcChannelOpenResponse,
    IbcPacketAckMsg, IbcPacketReceiveMsg, IbcPacketTimeoutMsg, IbcReceiveResponse, StdResult,
};

use crate::ibc_helpers::{validate_order_and_version, StdAck};

use crate::error::ContractError;
use crate::msg::PacketMsg;
use crate::state::STATE;
//use crate::state::PENDING;

pub const IBC_VERSION: &str = "counter-1";

#[entry_point]
/// enforces ordering and versioning constraints
pub fn ibc_channel_open(
    _deps: DepsMut,
    _env: Env,
    msg: IbcChannelOpenMsg,
) -> Result<IbcChannelOpenResponse, ContractError> {
    validate_order_and_version(msg.channel(), msg.counterparty_version())?;
    // We return the version we need (which could be different than the counterparty version)
    Ok(Some(Ibc3ChannelOpenResponse {
        version: IBC_VERSION.to_string(),
    }))
}

#[entry_point]
/// once it's established, we create the reflect contract
pub fn ibc_channel_connect(
    deps: DepsMut,
    _env: Env,
    msg: IbcChannelConnectMsg,
) -> Result<IbcBasicResponse, ContractError> {
    validate_order_and_version(msg.channel(), msg.counterparty_version())?;

    let mut state = STATE.load(deps.storage)?;
    if state.endpoint.is_some() {
        return Err(ContractError::AlreadyConnected {});
    }
    state.endpoint = Some(msg.channel().endpoint.clone());

    STATE.save(deps.storage, &state)?;

    Ok(IbcBasicResponse::new()
        .add_attribute("method", "ibc_channel_connect")
        .add_attribute("channel", &msg.channel().endpoint.channel_id)
        .add_attribute("port", &msg.channel().endpoint.port_id))
}

#[entry_point]
pub fn ibc_channel_close(
    _deps: DepsMut,
    _env: Env,
    msg: IbcChannelCloseMsg,
) -> Result<IbcBasicResponse, ContractError> {
    match msg {
        // Error any TX that would cause the channel to close that is
        // coming from the local chain.
        IbcChannelCloseMsg::CloseInit { channel: _ } => Err(ContractError::CantCloseChannel {}),
        // If we're here, something has gone catastrophically wrong on
        // our counterparty chain. Per the `CloseInit` handler above,
        // this contract will _never_ allow its channel to be
        // closed.
        //
        // Note: erroring here would prevent our side of the channel
        // closing (bad because the channel is, for all intents and
        // purposes, closed) so we must allow the transaction through.
        IbcChannelCloseMsg::CloseConfirm { channel: _ } => Ok(IbcBasicResponse::default()),
        _ => unreachable!("https://github.com/CosmWasm/cosmwasm/pull/1449"),
    }
}

#[entry_point]
pub fn ibc_packet_receive(
    deps: DepsMut,
    env: Env,
    msg: IbcPacketReceiveMsg,
) -> Result<IbcReceiveResponse, ContractError> {
    let packet_msg = from_slice(&msg.packet.data).unwrap();

    match packet_msg {
        PacketMsg::Increment {} => increment(deps, env),
        PacketMsg::Reset { count } => reset(deps, env, count),
    }
}

pub fn increment(deps: DepsMut, _env: Env) -> Result<IbcReceiveResponse, ContractError> {
    // TODO: increment local counter
    Ok(IbcReceiveResponse::new()
        .add_attribute("method", "ibc_packet_receive")
        .set_ack(StdAck::success(&"0")))
}

pub fn reset(deps: DepsMut, env: Env, count: i32) -> Result<IbcReceiveResponse, ContractError> {
    // TODO: set local counter's value to the new `count`
    Ok(IbcReceiveResponse::new()
        .add_attribute("method", "ibc_packet_receive")
        .set_ack(StdAck::success(&"0")))
}

#[entry_point]
pub fn ibc_packet_ack(
    deps: DepsMut,
    env: Env,
    msg: IbcPacketAckMsg,
) -> Result<IbcBasicResponse, ContractError> {
    Ok(IbcBasicResponse::new().add_attribute("action", "ibc_packet_ack"))
}

#[entry_point]
pub fn ibc_packet_timeout(
    _deps: DepsMut,
    _env: Env,
    _msg: IbcPacketTimeoutMsg,
) -> StdResult<IbcBasicResponse> {
    Ok(IbcBasicResponse::new().add_attribute("action", "ibc_packet_timeout"))
}
