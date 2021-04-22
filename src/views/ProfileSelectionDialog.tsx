import * as React from 'react';
import { Button, MenuItem, SplitButton } from 'react-bootstrap';
import { withTranslation } from 'react-i18next';
import { connect } from 'react-redux';
import * as Redux from 'redux';
import { ComponentEx, Modal, More, Toggle, types, util } from 'vortex-api';

import { setOpenProfileSelect } from '../actions/session';

import { IProfileData } from '../types';

interface IBaseProps {
  onSelectProfile: (profileData: IProfileData) => void;
}

interface IConnectedProps {
  profileData: { [profileId: string]: IProfileData };
  open: boolean;
}

interface IActionProps {
  onSetOpen: (open: boolean) => void;
}

interface IComponentState {
  selectedProfileId: string;
}

type IProps = IBaseProps & IConnectedProps & IActionProps;

class ProfileSelectionDialog extends ComponentEx<IProps, IComponentState> {
  constructor(props: IProps) {
    super(props);
    this.initState({
      selectedProfileId: undefined,
    });
  }

  public render(): JSX.Element {
    const { t, profileData, open } = this.props;
    const { selectedProfileId } = this.state;
    const profileIds = Object.keys(profileData);
    const title = selectedProfileId !== undefined
      ? `${selectedProfileId} - ${profileData[selectedProfileId].gameId} (enabled: ${profileData[selectedProfileId].enabledModIds.length})`
      : 'Select Profile';
    return (
      <Modal id='import-select-profile' show={open} onHide={this.close}>
        <Modal.Header>
          <h4> {t('Select a Profile')} </h4>
        </Modal.Header>
        <Modal.Body>
          {t('Select the profile you wish to import from:')}
          <br />
          <SplitButton
            id='import-select-profile'
            title={title}
            onSelect={this.selectProfileId}
          >
            {profileIds.map(this.renderProfile)}
          </SplitButton>
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={this.close}>{'Close'}</Button>
          <Button onClick={this.onClick}>{'Import From Profile'}</Button>
        </Modal.Footer>
      </Modal>
    );
  }

  private onClick = () => {
    if (!!this.state.selectedProfileId) {
      this.props.onSelectProfile(this.props.profileData[this.state.selectedProfileId]);
    }

    this.props.onSetOpen(false);
  }

  private close = () => {
    this.props.onSetOpen(false);
  }

  private renderProfile = (profId: string) => {
    const { profileData } = this.props;
    const text = `${profId} - ${profileData[profId].gameId} (enabled: ${profileData[profId].enabledModIds.length})`;
    return <MenuItem key={profId} eventKey={profId}>{text}</MenuItem>;
  }

  private selectProfileId = (eventKey) => {
    this.nextState.selectedProfileId = eventKey;
  }
}

function mapDispatchToProps(dispatch: Redux.Dispatch<any>): IActionProps {
  return {
    onSetOpen: (open) => dispatch(setOpenProfileSelect(open)),
  };
}

function mapStateToProps(state: types.IState): IConnectedProps {
  return {
    open: util.getSafe(state, ['session', 'depfulfiller', 'open'], false),
    profileData: util.getSafe(state, ['session', 'depfulfiller', 'userData'], {}),
  };
}

export default withTranslation(['common', 'dependency-fulfiller'])(
  connect(mapStateToProps, mapDispatchToProps)(
    ProfileSelectionDialog) as any) as React.ComponentClass<IBaseProps>;
